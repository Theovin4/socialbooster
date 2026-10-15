import {
  AggregateField,
  Timestamp,
  type Query,
} from "firebase-admin/firestore";
import { adminDb } from "./firebase/admin";
import {
  ACTIVE_FINANCE_ORDER_STATUSES,
  financePeriod,
  type FinanceOrder,
  type FinanceTransaction,
} from "./finance";
import { loadFinanceRollups } from "./firebase/analytics-rollups";

const DASHBOARD_RECORD_LIMIT = 200;
const MAX_RECORD_LIMIT = 1_000;

function date(value: unknown) {
  return (value as { toDate?: () => Date })?.toDate?.() || null;
}

function boundedLimit(value?: number) {
  if (!Number.isFinite(value)) return DASHBOARD_RECORD_LIMIT;
  return Math.max(1, Math.min(MAX_RECORD_LIMIT, Math.floor(value || 0)));
}

/** Quota-safe admin dashboard loader. It reads rollups plus at most 25 recent
 * orders; the larger loader below remains available only for explicit exports. */
export async function loadFinanceDashboardData(filters: { range?: string; from?: string; to?: string; status?: string }) {
  const db = adminDb(), period = financePeriod(filters), status = filters.status || "all";
  let query: Query = db.collection("orders");
  if (period.start) query = query.where("createdAt", ">=", Timestamp.fromDate(period.start));
  query = query.where("createdAt", "<=", Timestamp.fromDate(period.end));
  if (status !== "all") query = query.where("status", "==", status);
  const orderedQuery = query.orderBy("createdAt", "desc").limit(25);
  const [rollupResult, orderResult, statusAggregateResult] = await Promise.allSettled([
    loadFinanceRollups({ ...period, status }),
    orderedQuery.get(),
    status === "all" ? Promise.resolve(null) : Promise.all([
      query.count().get(),
      query.aggregate({ total: AggregateField.sum("customerPriceMinor") }).get(),
      query.aggregate({ total: AggregateField.sum("providerCostIncurredMinor") }).get(),
      query.aggregate({ total: AggregateField.sum("refundedAmountMinor") }).get(),
    ]),
  ]);
  const rollups = rollupResult.status === "fulfilled" ? rollupResult.value : null;
  const snapshot = orderResult.status === "fulfilled" ? orderResult.value : null;
  const statusAggregates = statusAggregateResult.status === "fulfilled" ? statusAggregateResult.value : null;
  const orders: FinanceOrder[] = (snapshot?.docs || []).map((doc) => ({
    id: doc.id, createdAt: date(doc.get("createdAt")), status: String(doc.get("status") || "unknown"),
    serviceName: String(doc.get("serviceName") || "Unknown service"),
    category: String(doc.get("categoryName") || doc.get("serviceName") || "Other").split(/[|\[]/)[0].trim(),
    quantity: Number(doc.get("quantity") || 0), customerPriceMinor: Number(doc.get("customerPriceMinor") || 0),
    providerCostMinor: Number(doc.get("providerCostMinor") || 0), grossProfitMinor: Number(doc.get("grossProfitMinor") || 0),
    providerOrderId: doc.get("providerOrderId"),
    providerAccepted: doc.get("providerAccepted") === true,
    providerCostIncurredMinor: Number(doc.get("providerCostIncurredMinor") || 0),
    refundedAmountMinor: Number(doc.get("refundedAmountMinor") || 0),
  }));
  const summaryRollup = rollups?.summary as Record<string, unknown> | null;
  let summary = null;
  if (summaryRollup && (status === "all" || statusAggregates)) {
    const value = (key: string) => Number(summaryRollup[key]);
    let orderCount = value("orderCount"), orderValueMinor = value("orderValueMinor"), refundsMinor = value("refundsMinor"), capitalDeployedMinor = value("capitalDeployedMinor");
    if (status !== "all" && statusAggregates) {
      const [count, orderValue, capital, refunds] = statusAggregates;
      orderCount = Number(count.data().count);
      orderValueMinor = Number(orderValue.data().total || 0);
      capitalDeployedMinor = Number(capital.data().total || 0);
      refundsMinor = Number(refunds.data().total || 0);
    }
    const netSalesMinor = orderValueMinor - refundsMinor, grossProfitMinor = netSalesMinor - capitalDeployedMinor;
    const activeCapitalMinor = status === "all"
      ? value("activeCapitalMinor")
      : ACTIVE_FINANCE_ORDER_STATUSES.includes(status as (typeof ACTIVE_FINANCE_ORDER_STATUSES)[number]) ? capitalDeployedMinor : 0;
    summary = {
      depositsMinor: value("depositsMinor"), orderValueMinor, refundsMinor, netSalesMinor, capitalDeployedMinor,
      activeCapitalMinor, grossProfitMinor,
      grossMarginBps: netSalesMinor > 0 ? Math.round(grossProfitMinor * 10_000 / netSalesMinor) : null,
      walletLiabilityMinor: value("walletLiabilityMinor"), orderCount,
      completedOrders: status === "completed" ? orderCount : status === "all" ? value("completedOrders") : 0,
    };
  }
  if (rollupResult.status === "rejected") console.error("[finance-dashboard] rollup unavailable", { error: rollupResult.reason instanceof Error ? rollupResult.reason.message : "Unknown error" });
  if (orderResult.status === "rejected") console.error("[finance-dashboard] recent orders unavailable", { error: orderResult.reason instanceof Error ? orderResult.reason.message : "Unknown error" });
  if (statusAggregateResult.status === "rejected") console.error("[finance-dashboard] status aggregate unavailable", { error: statusAggregateResult.reason instanceof Error ? statusAggregateResult.reason.message : "Unknown error" });
  return {
    orders, daily: rollups?.daily || [], period, summary,
    health: rollups?.health || {
      available: false,
      financeRollupVersion: null,
      historicalBackfillComplete: false,
      lastReconciliationStatus: null,
      lastReconciledAt: null,
    },
    availability: { rollups: Boolean(summary), recentOrders: Boolean(snapshot), statusAggregate: status === "all" || Boolean(statusAggregates) },
  };
}

export async function loadFinanceData(
  filters: {
    range?: string;
    from?: string;
    to?: string;
    status?: string;
  },
  options: { limit?: number } = {},
) {
  const db = adminDb();
  const period = financePeriod(filters);
  const limit = boundedLimit(options.limit);
  let ordersQuery: Query = db.collection("orders");
  let transactionsQuery: Query = db.collection("walletTransactions");

  if (period.start) {
    const start = Timestamp.fromDate(period.start);
    ordersQuery = ordersQuery.where("createdAt", ">=", start);
    transactionsQuery = transactionsQuery.where("createdAt", ">=", start);
  }

  if (filters.status && filters.status !== "all") {
    ordersQuery = ordersQuery.where("status", "==", filters.status);
  }

  const end = Timestamp.fromDate(period.end);
  ordersQuery = ordersQuery
    .where("createdAt", "<=", end)
    .orderBy("createdAt", "desc")
    .limit(limit);
  transactionsQuery = transactionsQuery
    .where("createdAt", "<=", end)
    .orderBy("createdAt", "desc")
    .limit(limit);

  const settled = await Promise.allSettled([
      ordersQuery.get(),
      transactionsQuery.get(),
      db
        .collection("wallets")
        .where("currency", "==", "NGN")
        .aggregate({ total: AggregateField.sum("availableMinor") })
        .get(),
    ]);
  const ordersSnapshot = settled[0].status === "fulfilled" ? settled[0].value : null;
  const transactionsSnapshot = settled[1].status === "fulfilled" ? settled[1].value : null;
  const walletAggregate = settled[2].status === "fulfilled" ? settled[2].value : null;
  const unavailable = [
    ordersSnapshot ? null : "orders",
    transactionsSnapshot ? null : "wallet activity",
    walletAggregate ? null : "wallet balance",
  ].filter((item): item is string => Boolean(item));
  settled.forEach((result, index) => {
    if (result.status === "rejected") console.error("[finance-dashboard] dataset unavailable", {
      dataset: ["orders", "wallet activity", "wallet balance"][index],
      error: result.reason instanceof Error ? result.reason.message : "Unknown error",
    });
  });

  const orders: FinanceOrder[] = (ordersSnapshot?.docs || [])
    .map((doc) => ({
      id: doc.id,
      createdAt: date(doc.get("createdAt")),
      status: String(doc.get("status") || "unknown"),
      serviceName: String(doc.get("serviceName") || "Unknown service"),
      category: String(
        doc.get("categoryName") || doc.get("serviceName") || "Other",
      )
        .split(/[|\[]/)[0]
        .trim(),
      quantity: Number(doc.get("quantity") || 0),
      customerPriceMinor: Number(doc.get("customerPriceMinor") || 0),
      providerCostMinor: Number(doc.get("providerCostMinor") || 0),
      grossProfitMinor: Number(doc.get("grossProfitMinor") || 0),
      refundedAmountMinor: Number(doc.get("refundedAmountMinor") || 0),
      providerOrderId: doc.get("providerOrderId"),
      providerAccepted: doc.get("providerAccepted") === true,
      providerCostIncurredMinor: Number(doc.get("providerCostIncurredMinor") || 0),
    }))
  const transactions: FinanceTransaction[] = (transactionsSnapshot?.docs || [])
    .map((doc) => ({
      id: doc.id,
      createdAt: date(doc.get("createdAt")),
      type: String(doc.get("type") || "unknown"),
      deltaMinor: Number(doc.get("deltaMinor") || 0),
      currency: String(doc.get("currency") || "NGN"),
      reference: String(doc.get("reference") || ""),
    }))
    .filter((item) => item.currency === "NGN");
  const walletLiabilityMinor = walletAggregate ? Number(walletAggregate.data().total || 0) : null;

  return {
    orders,
    transactions,
    walletLiabilityMinor,
    period,
    limit,
    availability: {
      orders: Boolean(ordersSnapshot),
      transactions: Boolean(transactionsSnapshot),
      wallet: Boolean(walletAggregate),
      unavailable,
    },
    truncated:
      (ordersSnapshot?.size || 0) === limit || (transactionsSnapshot?.size || 0) === limit,
  };
}
