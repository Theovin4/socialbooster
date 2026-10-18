import "server-only";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { ACTIVE_FINANCE_ORDER_STATUSES } from "../finance";
import {
  FINANCE_ROLLUP_VERSION,
  emptyFinanceMetrics,
  emptyOrderMetrics,
  orderStatusTransitionDelta,
  summaryForStatus,
  type FinanceOrderMetrics,
} from "../finance-rollup-model";
import { adminDb } from "./admin";
import { lagosDateKey } from "./stats";
import { providerOrderIndexId } from "../provider-confirmation-recovery";

export const ANALYTICS_GLOBAL = "global";
export const ANALYTICS_DAILY = "analyticsDaily";
export const ANALYTICS_FINANCE_MONTHS = "analyticsMonths";

type OrderCreatedRollupInput = {
  customerPriceMinor: number;
  dateKey: string;
  status?: string;
};
type WalletRollupInput = { type: string; deltaMinor: number; currency: string; dateKey?: string };
type StatusRollupInput = {
  orderId: string;
  previous: string;
  next: string;
  customerPriceMinor: number;
  providerCostIncurredMinor: number;
  dateKey: string;
  orderUpdate?: Record<string, unknown>;
};

const ACTIVE = new Set<string>(ACTIVE_FINANCE_ORDER_STATUSES);
const FAILED = new Set(["failed", "cancelled"]);

function validDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function refs(dateKey: string) {
  if (!validDateKey(dateKey)) throw new Error("Invalid finance date key");
  const db = adminDb();
  return {
    global: db.collection("analytics").doc(ANALYTICS_GLOBAL),
    daily: db.collection(ANALYTICS_DAILY).doc(dateKey),
    month: db.collection(ANALYTICS_FINANCE_MONTHS).doc(dateKey.slice(0, 7)),
  };
}

function statusMetrics(status: string, values: Record<string, unknown>) {
  return { byStatus: { [status || "unknown"]: values } };
}

function financeWrites(
  transaction: Transaction,
  dateKey: string,
  values: Record<string, unknown>,
  statusValues?: Record<string, unknown>,
) {
  const { global, daily, month } = refs(dateKey);
  const updatedAt = FieldValue.serverTimestamp();
  transaction.set(global, { ...values, ...(statusValues || {}), updatedAt }, { merge: true });
  transaction.set(daily, {
    dateKey,
    financeRollupVersion: FINANCE_ROLLUP_VERSION,
    ...values,
    ...(statusValues || {}),
    updatedAt,
  }, { merge: true });
  transaction.set(month, {
    monthKey: dateKey.slice(0, 7),
    financeRollupVersion: FINANCE_ROLLUP_VERSION,
    days: {
      [dateKey]: {
        ...values,
        ...(statusValues || {}),
        updatedAt,
      },
    },
    updatedAt,
  }, { merge: true });
}

/** Called inside the idempotent local order-creation transaction. */
export function recordFinanceOrderCreated(transaction: Transaction, input: OrderCreatedRollupInput) {
  const status = input.status || "submitting";
  const active = ACTIVE.has(status);
  const values: Record<string, unknown> = {
    orderCount: FieldValue.increment(1),
    orderValueMinor: FieldValue.increment(input.customerPriceMinor),
    activeOrders: FieldValue.increment(active ? 1 : 0),
  };
  financeWrites(transaction, input.dateKey, values, statusMetrics(status, values));
}

/** Called inside an idempotent wallet transaction, so every amount contributes once. */
export function recordWalletRollup(transaction: Transaction, input: WalletRollupInput) {
  if (input.currency !== "NGN") return;
  const dateKey = input.dateKey || lagosDateKey();
  const values: Record<string, unknown> = {
    walletLiabilityMinor: FieldValue.increment(input.deltaMinor),
  };
  if (input.type === "deposit") values.depositsMinor = FieldValue.increment(input.deltaMinor);
  if (input.type === "refund") values.refundsMinor = FieldValue.increment(input.deltaMinor);
  financeWrites(transaction, dateKey, values);
}

function classification(status: string, cost: number, price: number, direction: 1 | -1) {
  const active = ACTIVE.has(status);
  return {
    orderCount: FieldValue.increment(direction),
    orderValueMinor: FieldValue.increment(direction * price),
    capitalDeployedMinor: FieldValue.increment(direction * cost),
    activeCapitalMinor: FieldValue.increment(active ? direction * cost : 0),
    completedOrders: FieldValue.increment(status === "completed" ? direction : 0),
    failedOrders: FieldValue.increment(FAILED.has(status) ? direction : 0),
    activeOrders: FieldValue.increment(active ? direction : 0),
  };
}

function statusTransitionValues(input: StatusRollupInput) {
  const delta = orderStatusTransitionDelta(input.previous, input.next, input.providerCostIncurredMinor);
  return {
    topLevel: {
      activeOrders: FieldValue.increment(delta.activeOrders),
      activeCapitalMinor: FieldValue.increment(delta.activeCapitalMinor),
      completedOrders: FieldValue.increment(delta.completedOrders),
      failedOrders: FieldValue.increment(delta.failedOrders),
    },
    byStatus: {
      [input.previous || "unknown"]: classification(input.previous || "unknown", input.providerCostIncurredMinor, input.customerPriceMinor, -1),
      [input.next || "unknown"]: classification(input.next || "unknown", input.providerCostIncurredMinor, input.customerPriceMinor, 1),
    },
  };
}

/** Records an order-status classification move exactly once on its creation day. */
export async function recordFinanceOrderStatus(input: StatusRollupInput) {
  const db = adminDb();
  const orderRef = db.collection("orders").doc(input.orderId);
  const eventRef = db.collection("analyticsEvents").doc();
  return db.runTransaction(async (transaction) => {
    const order = await transaction.get(orderRef);
    if (!order.exists) throw new Error("Order not found");
    const previous = String(order.get("status") || input.previous || "unknown");
    if (previous === input.next) return { duplicate: true };
    const dateKey = validDateKey(order.get("financeDateKey"))
      ? String(order.get("financeDateKey"))
      : input.dateKey;
    const customerPriceMinor = Number(order.get("customerPriceMinor") ?? input.customerPriceMinor);
    const providerCostIncurredMinor = Number(order.get("providerCostIncurredMinor") ?? input.providerCostIncurredMinor);
    if (!validDateKey(dateKey)
      || !Number.isSafeInteger(customerPriceMinor) || customerPriceMinor < 0
      || !Number.isSafeInteger(providerCostIncurredMinor) || providerCostIncurredMinor < 0) {
      throw new Error("Order finance classification is invalid");
    }
    const values = statusTransitionValues({
      ...input,
      previous,
      dateKey,
      customerPriceMinor,
      providerCostIncurredMinor,
    });
    transaction.create(eventRef, {
      type: "order_status",
      orderId: input.orderId,
      previous,
      next: input.next,
      financeDateKey: dateKey,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (input.orderUpdate) {
      transaction.set(orderRef, input.orderUpdate, { merge: true });
    }
    financeWrites(transaction, dateKey, values.topLevel, { byStatus: values.byStatus });
    return { duplicate: false };
  });
}

/** Persists provider acceptance and deployed capital in one idempotent transaction. */
export async function recordFinanceProviderAccepted(input: {
  orderId: string;
  providerOrderId: number;
  confirmationRecovery?: { resolvedBy: string; note: string; providerStatus: string };
}) {
  if (!Number.isSafeInteger(input.providerOrderId) || input.providerOrderId <= 0) throw new Error("Invalid provider order ID");
  const db = adminDb();
  const orderRef = db.collection("orders").doc(input.orderId);
  const eventRef = db.collection("analyticsEvents").doc(`order_provider_accepted_${input.orderId}`);
  return db.runTransaction(async (transaction) => {
    const [existing, order] = await Promise.all([transaction.get(eventRef), transaction.get(orderRef)]);
    if (!order.exists) throw new Error("Order not found");
    const providerKey = String(order.get("providerKey") || "");
    const indexRef = db.collection("providerOrderIndex").doc(providerOrderIndexId(providerKey, input.providerOrderId));
    const index = await transaction.get(indexRef);
    if (index.exists && index.get("orderId") !== input.orderId) throw new Error("Provider order ID is already assigned");
    if (existing.exists) {
      if (Number(order.get("providerOrderId")) !== input.providerOrderId) throw new Error("Provider order ID conflict");
      if (!index.exists) transaction.create(indexRef, { providerKey, providerOrderId: input.providerOrderId, orderId: input.orderId, createdAt: FieldValue.serverTimestamp() });
      return { duplicate: true, status: String(order.get("status") || "pending") };
    }
    const previous = String(order.get("status") || "submitting");
    const dateKey = validDateKey(order.get("financeDateKey"))
      ? String(order.get("financeDateKey"))
      : lagosDateKey(order.get("createdAt")?.toDate?.() || new Date());
    const customerPriceMinor = Number(order.get("customerPriceMinor") || 0);
    const providerCostMinor = Number(order.get("providerCostMinor") || 0);
    if (!Number.isSafeInteger(customerPriceMinor) || customerPriceMinor < 0 || !Number.isSafeInteger(providerCostMinor) || providerCostMinor < 0) {
      throw new Error("Order finance amounts are invalid");
    }
    const next = "pending";
    const statusValues = statusTransitionValues({
      orderId: input.orderId,
      previous,
      next,
      customerPriceMinor,
      providerCostIncurredMinor: 0,
      dateKey,
    });
    const byStatus = statusValues.byStatus;
    byStatus[next] = {
      ...byStatus[next],
      capitalDeployedMinor: FieldValue.increment(providerCostMinor),
      activeCapitalMinor: FieldValue.increment(providerCostMinor),
    };
    const topLevel = {
      ...statusValues.topLevel,
      capitalDeployedMinor: FieldValue.increment(providerCostMinor),
      activeCapitalMinor: FieldValue.increment(providerCostMinor),
    };
    transaction.create(eventRef, {
      type: "order_provider_accepted",
      orderId: input.orderId,
      providerOrderId: input.providerOrderId,
      providerCostMinor,
      financeDateKey: dateKey,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(indexRef, {
      providerKey,
      providerOrderId: input.providerOrderId,
      orderId: input.orderId,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.set(orderRef, {
      providerOrderId: input.providerOrderId,
      providerAccepted: true,
      submissionOutcome: "CONFIRMED_ACCEPTED",
      providerCostIncurredMinor: providerCostMinor,
      status: next,
      submittedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(input.confirmationRecovery ? {
        providerConfirmationResolution: "accepted",
        providerConfirmationResolvedBy: input.confirmationRecovery.resolvedBy,
        providerConfirmationReviewNote: input.confirmationRecovery.note,
        providerConfirmationVerifiedStatus: input.confirmationRecovery.providerStatus,
        providerConfirmationResolvedAt: FieldValue.serverTimestamp(),
      } : {}),
    }, { merge: true });
    financeWrites(transaction, dateKey, topLevel, { byStatus });
    return { duplicate: false, status: next };
  });
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOrderMetrics(value: Record<string, unknown>): FinanceOrderMetrics | null {
  const result = emptyOrderMetrics();
  for (const key of Object.keys(result) as Array<keyof FinanceOrderMetrics>) {
    const parsed = finiteNumber(value[key]);
    if (parsed === null) return null;
    result[key] = parsed;
  }
  return result;
}

function normalizeFinanceMetrics(value: Record<string, unknown>) {
  const order = normalizeOrderMetrics(value);
  if (!order) return null;
  const metrics = { ...emptyFinanceMetrics(), ...order };
  for (const key of ["depositsMinor", "refundsMinor", "walletLiabilityMinor"] as const) {
    const parsed = finiteNumber(value[key]);
    if (parsed === null) return null;
    metrics[key] = parsed;
  }
  const byStatusRaw = value.byStatus;
  const byStatus: Record<string, FinanceOrderMetrics> = {};
  if (byStatusRaw && typeof byStatusRaw === "object" && !Array.isArray(byStatusRaw)) {
    for (const [status, raw] of Object.entries(byStatusRaw)) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const parsed = normalizeOrderMetrics(raw as Record<string, unknown>);
      if (!parsed) return null;
      byStatus[status] = parsed;
    }
  }
  return { ...metrics, byStatus };
}

function monthKeys(start: Date, end: Date) {
  const startKey = lagosDateKey(start).slice(0, 7), endKey = lagosDateKey(end).slice(0, 7);
  const keys: string[] = [];
  let cursor = new Date(`${startKey}-01T12:00:00+01:00`);
  while (lagosDateKey(cursor).slice(0, 7) <= endKey && keys.length < 240) {
    keys.push(lagosDateKey(cursor).slice(0, 7));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1, 11));
  }
  if (lagosDateKey(cursor).slice(0, 7) <= endKey) throw new Error("Finance custom range exceeds the 20-year reporting limit");
  return keys;
}

export type FinanceRollupHealth = {
  available: boolean;
  financeRollupVersion: number | null;
  historicalBackfillComplete: boolean;
  lastReconciliationStatus: string | null;
  lastReconciledAt: Date | null;
};

function timestampDate(value: unknown) {
  return (value as { toDate?: () => Date } | null)?.toDate?.() || null;
}

/** Read-only rollup loader. Historical repair is never run from a page request. */
export async function loadFinanceRollups(input: { start: Date | null; end: Date; status?: string }) {
  const db = adminDb();
  const globalSnapshot = await db.collection("analytics").doc(ANALYTICS_GLOBAL).get();
  const version = finiteNumber(globalSnapshot.get("financeRollupVersion"));
  const complete = globalSnapshot.get("historicalBackfillComplete") === true;
  const normalizedGlobal = globalSnapshot.exists ? normalizeFinanceMetrics((globalSnapshot.data() || {}) as Record<string, unknown>) : null;
  const health: FinanceRollupHealth = {
    available: version === FINANCE_ROLLUP_VERSION && complete && Boolean(normalizedGlobal),
    financeRollupVersion: version,
    historicalBackfillComplete: complete,
    lastReconciliationStatus: typeof globalSnapshot.get("lastReconciliationStatus") === "string" ? globalSnapshot.get("lastReconciliationStatus") : null,
    lastReconciledAt: timestampDate(globalSnapshot.get("lastReconciledAt")),
  };
  if (!health.available || !normalizedGlobal) {
    return { summary: null, daily: [] as Array<Record<string, unknown>>, health };
  }
  if (!input.start) {
    return {
      summary: summaryForStatus(normalizedGlobal, input.status || "all"),
      daily: [] as Array<Record<string, unknown>>,
      health,
    };
  }
  const keys = monthKeys(input.start, input.end);
  const snapshots = keys.length
    ? await db.getAll(...keys.map((key) => db.collection(ANALYTICS_FINANCE_MONTHS).doc(key)))
    : [];
  const startKey = lagosDateKey(input.start), endKey = lagosDateKey(input.end);
  const rows: Array<Record<string, unknown>> = [];
  for (const snapshot of snapshots) {
    const days = snapshot.get("days");
    if (!days || typeof days !== "object" || Array.isArray(days)) continue;
    for (const [dateKey, raw] of Object.entries(days as Record<string, unknown>)) {
      if (dateKey < startKey || dateKey > endKey || !raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const normalized = normalizeFinanceMetrics({
        ...emptyFinanceMetrics(),
        ...(raw as Record<string, unknown>),
        walletLiabilityMinor: normalizedGlobal.walletLiabilityMinor,
      });
      if (!normalized) continue;
      rows.push({ dateKey, ...summaryForStatus(normalized, input.status || "all") });
    }
  }
  rows.sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));
  const summary = emptyFinanceMetrics();
  for (const row of rows) {
    for (const key of Object.keys(emptyOrderMetrics()) as Array<keyof FinanceOrderMetrics>) summary[key] += Number(row[key] || 0);
    summary.depositsMinor += Number(row.depositsMinor || 0);
    summary.refundsMinor += Number(row.refundsMinor || 0);
  }
  summary.walletLiabilityMinor = normalizedGlobal.walletLiabilityMinor;
  return { summary, daily: rows, health };
}

export async function loadCustomerGrowthDays(startKey: string, endKey: string) {
  const start = new Date(`${startKey}T00:00:00+01:00`), end = new Date(`${endKey}T23:59:59+01:00`);
  const snapshots = await adminDb().getAll(...monthKeys(start, end).map((key) => adminDb().collection(ANALYTICS_FINANCE_MONTHS).doc(key)));
  const result: Record<string, number> = {};
  for (const snapshot of snapshots) {
    const days = snapshot.get("days");
    if (!days || typeof days !== "object" || Array.isArray(days)) continue;
    for (const [dateKey, value] of Object.entries(days as Record<string, unknown>)) {
      if (dateKey < startKey || dateKey > endKey || !value || typeof value !== "object" || Array.isArray(value)) continue;
      const count = Number((value as Record<string, unknown>).newCustomers);
      if (Number.isFinite(count) && count >= 0) result[dateKey] = count;
    }
  }
  return result;
}

/** Compatibility helper: reads health only and never bootstraps on page load. */
export async function ensureFinanceRollups() {
  const snapshot = await adminDb().collection("analytics").doc(ANALYTICS_GLOBAL).get();
  return (snapshot.data() || {}) as Record<string, unknown>;
}
