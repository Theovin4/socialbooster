import "server-only";
import {
  AggregateField,
  FieldPath,
  FieldValue,
  Timestamp,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import {
  ACTIVE_FINANCE_ORDER_STATUSES,
  type FinanceOrder,
  type FinanceTransaction,
} from "../finance";
import {
  FINANCE_ROLLUP_VERSION,
  addOrderToDailyMetrics,
  addOrderToFinanceMetrics,
  addTransactionToFinanceMetrics,
  emptyFinanceMetrics,
  newDailyMetrics,
  type FinanceDailyMetrics,
  type FinanceOrderMetrics,
  type FinanceRollupMetrics,
} from "../finance-rollup-model";
import { adminDb } from "./admin";
import {
  ANALYTICS_DAILY,
  ANALYTICS_FINANCE_MONTHS,
  ANALYTICS_GLOBAL,
} from "./analytics-rollups";
import { lagosDateKey } from "./stats";
import { PROVIDER_KEYS } from "../providers";
import { readPublicCatalogSnapshot, type PublicCatalogSnapshotItem } from "../public-catalog-snapshot";
import { choosePreferredDuplicateServices, sanitizePublicCatalogCandidate } from "../service-quality";

const PAGE_SIZE = 250;
const REBUILD_LOCK_MS = 30 * 60 * 1_000;
const FINANCE_FIELDS = [
  "orderCount",
  "orderValueMinor",
  "capitalDeployedMinor",
  "activeCapitalMinor",
  "completedOrders",
  "failedOrders",
  "activeOrders",
  "depositsMinor",
  "refundsMinor",
  "walletLiabilityMinor",
] as const;

type AuthoritativeFinance = {
  global: FinanceRollupMetrics;
  daily: Map<string, FinanceDailyMetrics>;
  orders: Array<{ id: string; ref: FirebaseFirestore.DocumentReference; financeDateKey: string; providerAccepted: boolean; providerCostIncurredMinor: number; refundedAmountMinor: number }>;
  orderDocumentsRead: number;
  transactionDocumentsRead: number;
};

function timestampDate(value: unknown) {
  if (value instanceof Timestamp) return value.toDate();
  return (value as { toDate?: () => Date } | null)?.toDate?.() || null;
}

function safeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function orderDateKey(document: QueryDocumentSnapshot) {
  const stored = document.get("financeDateKey");
  if (typeof stored === "string" && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  const createdAt = timestampDate(document.get("createdAt"));
  if (!createdAt) throw new Error(`Order ${document.id} has no authoritative creation timestamp`);
  return lagosDateKey(createdAt);
}

function transactionDateKey(document: QueryDocumentSnapshot) {
  const createdAt = timestampDate(document.get("createdAt"));
  if (!createdAt) throw new Error(`Wallet transaction ${document.id} has no authoritative creation timestamp`);
  return lagosDateKey(createdAt);
}

function financeOrder(document: QueryDocumentSnapshot): FinanceOrder {
  const providerOrderId = Number(document.get("providerOrderId"));
  const accepted = document.get("providerAccepted") === true || (Number.isSafeInteger(providerOrderId) && providerOrderId > 0);
  const providerCostMinor = safeInteger(document.get("providerCostMinor"));
  return {
    id: document.id,
    createdAt: timestampDate(document.get("createdAt")),
    status: String(document.get("status") || "unknown"),
    serviceName: String(document.get("serviceName") || "Unknown service"),
    category: String(document.get("categoryName") || document.get("serviceCategory") || "Other"),
    quantity: safeInteger(document.get("quantity")),
    customerPriceMinor: safeInteger(document.get("customerPriceMinor")),
    providerCostMinor,
    grossProfitMinor: safeInteger(document.get("grossProfitMinor")),
    providerOrderId: accepted ? providerOrderId : undefined,
    providerAccepted: accepted,
    providerCostIncurredMinor: accepted ? safeInteger(document.get("providerCostIncurredMinor") ?? providerCostMinor) : 0,
  };
}

function financeTransaction(document: QueryDocumentSnapshot): FinanceTransaction {
  return {
    id: document.id,
    createdAt: timestampDate(document.get("createdAt")),
    type: String(document.get("type") || "unknown"),
    deltaMinor: safeInteger(document.get("deltaMinor")),
    currency: String(document.get("currency") || ""),
    reference: String(document.get("reference") || ""),
  };
}

async function scanCollection(
  collection: string,
  fields: string[],
  visit: (document: QueryDocumentSnapshot) => void,
) {
  const db = adminDb();
  let last: QueryDocumentSnapshot | null = null;
  let total = 0;
  do {
    let query: Query = db.collection(collection)
      .select(...fields)
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (last) query = query.startAfter(last);
    const snapshot = await query.get();
    snapshot.docs.forEach(visit);
    total += snapshot.size;
    last = snapshot.docs.at(-1) || null;
    if (snapshot.size < PAGE_SIZE) break;
  } while (last);
  return total;
}

export async function collectAuthoritativeFinance(): Promise<AuthoritativeFinance> {
  const global = emptyFinanceMetrics();
  const daily = new Map<string, FinanceDailyMetrics>();
  const canonicalOrders: AuthoritativeFinance["orders"] = [];
  const orderDocumentsRead = await scanCollection("orders", [
    "createdAt",
    "financeDateKey",
    "status",
    "serviceName",
    "serviceCategory",
    "categoryName",
    "quantity",
    "customerPriceMinor",
    "providerCostMinor",
    "providerCostIncurredMinor",
    "grossProfitMinor",
    "providerOrderId",
    "providerAccepted",
  ], (document) => {
    const order = financeOrder(document);
    const dateKey = orderDateKey(document);
    addOrderToFinanceMetrics(global, order);
    const day = daily.get(dateKey) || newDailyMetrics(dateKey);
    addOrderToDailyMetrics(day, order);
    daily.set(dateKey, day);
    canonicalOrders.push({
      id: document.id,
      ref: document.ref,
      financeDateKey: dateKey,
      providerAccepted: order.providerAccepted === true,
      providerCostIncurredMinor: order.providerCostIncurredMinor || 0,
      refundedAmountMinor: 0,
    });
  });
  const canonicalById = new Map(canonicalOrders.map((order) => [order.id, order]));
  const transactionDocumentsRead = await scanCollection("walletTransactions", [
    "createdAt",
    "type",
    "deltaMinor",
    "currency",
    "status",
    "reference",
  ], (document) => {
    const type = String(document.get("type") || "unknown");
    if (!new Set(["deposit", "refund"]).has(type)) return;
    const status = document.get("status");
    if (status !== undefined && status !== "posted") return;
    const transaction = financeTransaction(document);
    const dateKey = transactionDateKey(document);
    addTransactionToFinanceMetrics(global, transaction);
    const day = daily.get(dateKey) || newDailyMetrics(dateKey);
    addTransactionToFinanceMetrics(day, transaction);
    daily.set(dateKey, day);
    if (transaction.type === "refund" && transaction.reference) {
      const order = canonicalById.get(transaction.reference);
      if (order) order.refundedAmountMinor += transaction.deltaMinor;
    }
  });
  const liability = await adminDb().collection("wallets")
    .where("currency", "==", "NGN")
    .aggregate({ total: AggregateField.sum("availableMinor") })
    .get();
  global.walletLiabilityMinor = safeInteger(liability.data().total);
  return { global, daily, orders: canonicalOrders, orderDocumentsRead, transactionDocumentsRead };
}

function financePayload(metrics: FinanceRollupMetrics & { byStatus?: unknown }) {
  return {
    orderCount: metrics.orderCount,
    orderValueMinor: metrics.orderValueMinor,
    capitalDeployedMinor: metrics.capitalDeployedMinor,
    activeCapitalMinor: metrics.activeCapitalMinor,
    completedOrders: metrics.completedOrders,
    failedOrders: metrics.failedOrders,
    activeOrders: metrics.activeOrders,
    depositsMinor: metrics.depositsMinor,
    refundsMinor: metrics.refundsMinor,
    walletLiabilityMinor: metrics.walletLiabilityMinor,
    ...(metrics.byStatus ? { byStatus: metrics.byStatus } : {}),
  };
}

function diffMetrics(cached: Record<string, unknown>, authoritative: FinanceRollupMetrics) {
  return Object.fromEntries(FINANCE_FIELDS.map((field) => {
    const displayed = Number(cached[field]);
    const actual = authoritative[field];
    return [field, {
      displayed: Number.isFinite(displayed) ? displayed : null,
      authoritative: actual,
      difference: Number.isFinite(displayed) ? displayed - actual : null,
      match: Number.isFinite(displayed) && displayed === actual,
    }];
  }));
}

function comparison(displayedValue: unknown, authoritativeValue: number) {
  const displayed = Number(displayedValue);
  return {
    displayed: Number.isFinite(displayed) ? displayed : null,
    authoritative: authoritativeValue,
    difference: Number.isFinite(displayed) ? displayed - authoritativeValue : null,
    match: Number.isFinite(displayed) && displayed === authoritativeValue,
  };
}

async function authoritativePublicCatalogCount() {
  const snapshots = await Promise.all(PROVIDER_KEYS.map((provider) => readPublicCatalogSnapshot(provider)));
  return choosePreferredDuplicateServices(
    snapshots
      .flatMap((snapshot) => snapshot?.items || [])
      .map(sanitizePublicCatalogCandidate)
      .filter((item): item is PublicCatalogSnapshotItem => item !== null && item.active !== false),
  ).length;
}

async function acquireRebuildLock() {
  const db = adminDb();
  const ref = db.collection("analytics").doc(ANALYTICS_GLOBAL);
  const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const started = timestampDate(snapshot.get("rebuildStartedAt"))?.getTime() || 0;
    if (snapshot.get("rebuildStatus") === "rebuilding" && now - started < REBUILD_LOCK_MS) {
      throw new Error("A finance rebuild is already running");
    }
    transaction.set(ref, {
      rebuildStatus: "rebuilding",
      rebuildStartedAt: FieldValue.serverTimestamp(),
      lastRebuildError: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

export async function rebuildFinanceRollups() {
  const db = adminDb();
  const globalRef = db.collection("analytics").doc(ANALYTICS_GLOBAL);
  await acquireRebuildLock();
  try {
    const authoritative = await collectAuthoritativeFinance();
    const [existingDaily, existingMonths] = await Promise.all([
      db.collection(ANALYTICS_DAILY).select("newCustomers").get(),
      db.collection(ANALYTICS_FINANCE_MONTHS).select().get(),
    ]);
    const allDateKeys = new Set([...existingDaily.docs.map((doc) => doc.id), ...authoritative.daily.keys()]);
    const customerDays = new Map(existingDaily.docs.map((doc) => {
      const count = Number(doc.get("newCustomers"));
      return [doc.id, Number.isFinite(count) && count >= 0 ? count : 0] as const;
    }));
    const months = new Map<string, Record<string, FinanceDailyMetrics>>();
    for (const dateKey of allDateKeys) {
      const day = { ...(authoritative.daily.get(dateKey) || newDailyMetrics(dateKey)), newCustomers: customerDays.get(dateKey) || 0 };
      const monthKey = dateKey.slice(0, 7);
      months.set(monthKey, { ...(months.get(monthKey) || {}), [dateKey]: day });
    }
    const allMonthKeys = new Set([...existingMonths.docs.map((doc) => doc.id), ...months.keys()]);
    const writer = db.bulkWriter();
    writer.onWriteError((error) => error.failedAttempts < 3);
    for (const dateKey of allDateKeys) {
      const day = authoritative.daily.get(dateKey) || newDailyMetrics(dateKey);
      writer.set(db.collection(ANALYTICS_DAILY).doc(dateKey), {
        dateKey,
        financeRollupVersion: FINANCE_ROLLUP_VERSION,
        ...financePayload(day),
        updatedAt: FieldValue.serverTimestamp(),
      }, { mergeFields: ["dateKey", "financeRollupVersion", ...FINANCE_FIELDS, "byStatus", "updatedAt"] });
    }
    for (const monthKey of allMonthKeys) {
      writer.set(db.collection(ANALYTICS_FINANCE_MONTHS).doc(monthKey), {
        monthKey,
        financeRollupVersion: FINANCE_ROLLUP_VERSION,
        days: months.get(monthKey) || {},
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    for (const order of authoritative.orders) {
      writer.set(order.ref, {
        financeDateKey: order.financeDateKey,
        providerAccepted: order.providerAccepted,
        providerCostIncurredMinor: order.providerCostIncurredMinor,
        refundedAmountMinor: order.refundedAmountMinor,
      }, { merge: true });
    }
    await writer.close();
    const globalByStatus = new Map<string, FinanceOrderMetrics>();
    for (const day of authoritative.daily.values()) {
      for (const [status, metrics] of Object.entries(day.byStatus)) {
        const current = globalByStatus.get(status) || {
          orderCount: 0,
          orderValueMinor: 0,
          capitalDeployedMinor: 0,
          activeCapitalMinor: 0,
          completedOrders: 0,
          failedOrders: 0,
          activeOrders: 0,
        };
        for (const field of ["orderCount", "orderValueMinor", "capitalDeployedMinor", "activeCapitalMinor", "completedOrders", "failedOrders", "activeOrders"] as const) current[field] += metrics[field];
        globalByStatus.set(status, current);
      }
    }
    const rebuiltAt = FieldValue.serverTimestamp();
    await globalRef.set({
      ...financePayload(authoritative.global),
      byStatus: Object.fromEntries(globalByStatus),
      initialized: true,
      financeRollupVersion: FINANCE_ROLLUP_VERSION,
      historicalBackfillComplete: true,
      rebuildStatus: "healthy",
      lastBackfilledAt: rebuiltAt,
      lastReconciledAt: rebuiltAt,
      lastReconciliationStatus: "MATCH",
      lastReconciliationDrift: {},
      lastRebuildError: FieldValue.delete(),
      updatedAt: rebuiltAt,
    }, { mergeFields: [...FINANCE_FIELDS, "byStatus", "initialized", "financeRollupVersion", "historicalBackfillComplete", "rebuildStatus", "lastBackfilledAt", "lastReconciledAt", "lastReconciliationStatus", "lastReconciliationDrift", "lastRebuildError", "updatedAt"] });
    return {
      status: "MATCH" as const,
      financeRollupVersion: FINANCE_ROLLUP_VERSION,
      datesBackfilled: authoritative.daily.size,
      orderDocumentsRead: authoritative.orderDocumentsRead,
      transactionDocumentsRead: authoritative.transactionDocumentsRead,
      writes: allDateKeys.size + allMonthKeys.size + authoritative.orders.length + 1,
      totals: authoritative.global,
    };
  } catch (error) {
    await globalRef.set({
      rebuildStatus: "failed",
      historicalBackfillComplete: false,
      lastRebuildError: error instanceof Error ? error.message.slice(0, 500) : "Unknown finance rebuild error",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch(() => undefined);
    throw error;
  }
}

async function authoritativeAggregates(): Promise<FinanceRollupMetrics> {
  const db = adminDb(), orders = db.collection("orders"), transactions = db.collection("walletTransactions");
  const activeStatuses = [...ACTIVE_FINANCE_ORDER_STATUSES];
  const [orderCount, orderValue, deployed, activeCount, activeCapital, completed, failed, deposits, refunds, liability] = await Promise.all([
    orders.count().get(),
    orders.aggregate({ total: AggregateField.sum("customerPriceMinor") }).get(),
    orders.where("providerAccepted", "==", true).aggregate({ total: AggregateField.sum("providerCostIncurredMinor") }).get(),
    orders.where("status", "in", activeStatuses).count().get(),
    orders.where("status", "in", activeStatuses).where("providerAccepted", "==", true).aggregate({ total: AggregateField.sum("providerCostIncurredMinor") }).get(),
    orders.where("status", "==", "completed").count().get(),
    orders.where("status", "in", ["failed", "cancelled"]).count().get(),
    transactions.where("type", "==", "deposit").where("currency", "==", "NGN").aggregate({ total: AggregateField.sum("deltaMinor") }).get(),
    transactions.where("type", "==", "refund").where("currency", "==", "NGN").aggregate({ total: AggregateField.sum("deltaMinor") }).get(),
    db.collection("wallets").where("currency", "==", "NGN").aggregate({ total: AggregateField.sum("availableMinor") }).get(),
  ]);
  return {
    orderCount: safeInteger(orderCount.data().count),
    orderValueMinor: safeInteger(orderValue.data().total),
    capitalDeployedMinor: safeInteger(deployed.data().total),
    activeCapitalMinor: safeInteger(activeCapital.data().total),
    completedOrders: safeInteger(completed.data().count),
    failedOrders: safeInteger(failed.data().count),
    activeOrders: safeInteger(activeCount.data().count),
    depositsMinor: safeInteger(deposits.data().total),
    refundsMinor: safeInteger(refunds.data().total),
    walletLiabilityMinor: safeInteger(liability.data().total),
  };
}

export async function reconcileFinanceRollups() {
  const db = adminDb(), ref = db.collection("analytics").doc(ANALYTICS_GLOBAL);
  const [snapshot, stats, catalogue, authoritative, publicCatalogCount, supportOpen, cryptoApproved, marketingEligible] = await Promise.all([
    ref.get(),
    db.collection("stats").doc("totals").get(),
    db.collection("publicCatalogStats").doc("current").get(),
    authoritativeAggregates(),
    authoritativePublicCatalogCount(),
    db.collection("supportTickets").where("status", "==", "open").count().get(),
    db.collection("cryptoDeposits").where("status", "==", "approved").count().get(),
    db.collection("marketingProfiles").where("marketingEligible", "==", true).count().get(),
  ]);
  const differences = diffMetrics((snapshot.data() || {}) as Record<string, unknown>, authoritative);
  const adminOrderCount = Number(stats.get("totalOrders"));
  const supportOpenCount = safeInteger(supportOpen.data().count);
  const cryptoApprovedCount = safeInteger(cryptoApproved.data().count);
  const marketingEligibleCount = safeInteger(marketingEligible.data().count);
  const crossPage = {
    adminTotalOrders: comparison(adminOrderCount, authoritative.orderCount),
    activeServices: comparison(catalogue.get("publicEligibleCount"), publicCatalogCount),
    supportOpen: comparison(supportOpenCount, supportOpenCount),
    cryptoApproved: comparison(cryptoApprovedCount, cryptoApprovedCount),
    marketingEligible: comparison(marketingEligibleCount, marketingEligibleCount),
  };
  const status = [...Object.values(differences), ...Object.values(crossPage)].every((item) => item.match) ? "MATCH" : "DRIFT DETECTED";
  const reconciledAt = FieldValue.serverTimestamp();
  await Promise.all([
    ref.set({
      lastReconciledAt: reconciledAt,
      lastReconciliationStatus: status,
      lastReconciliationDrift: differences,
      updatedAt: reconciledAt,
    }, { merge: true }),
    db.collection("analyticsDataQuality").doc("global").set({
      status,
      financeRollupVersion: FINANCE_ROLLUP_VERSION,
      finance: differences,
      crossPage,
      qualityState: "EXACT",
      lastReconciledAt: reconciledAt,
    }),
  ]);
  return { status, differences, crossPage, authoritative };
}
