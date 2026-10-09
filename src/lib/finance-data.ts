import {
  AggregateField,
  Timestamp,
  type Query,
} from "firebase-admin/firestore";
import { adminDb } from "./firebase/admin";
import {
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
  const db = adminDb(), period = financePeriod(filters), rollups = await loadFinanceRollups(period);
  let query: Query = db.collection("orders");
  if (period.start) query = query.where("createdAt", ">=", Timestamp.fromDate(period.start));
  query = query.where("createdAt", "<=", Timestamp.fromDate(period.end));
  if (filters.status && filters.status !== "all") query = query.where("status", "==", filters.status);
  const snapshot = await query.orderBy("createdAt", "desc").limit(25).get();
  const orders: FinanceOrder[] = snapshot.docs.map((doc) => ({
    id: doc.id, createdAt: date(doc.get("createdAt")), status: String(doc.get("status") || "unknown"),
    serviceName: String(doc.get("serviceName") || "Unknown service"),
    category: String(doc.get("categoryName") || doc.get("serviceName") || "Other").split(/[|\[]/)[0].trim(),
    quantity: Number(doc.get("quantity") || 0), customerPriceMinor: Number(doc.get("customerPriceMinor") || 0),
    providerCostMinor: Number(doc.get("providerCostMinor") || 0), grossProfitMinor: Number(doc.get("grossProfitMinor") || 0),
    providerOrderId: doc.get("providerOrderId"),
  }));
  const summaryRollup = rollups.summary as Record<string, unknown>;
  const value = (key: string) => Number(summaryRollup[key] || 0);
  const orderValueMinor = value("orderValueMinor"), refundsMinor = value("refundsMinor"), netSalesMinor = Math.max(0, orderValueMinor - refundsMinor);
  const capitalDeployedMinor = value("capitalDeployedMinor"), grossProfitMinor = netSalesMinor - capitalDeployedMinor;
  return {
    orders, daily: rollups.daily, period,
    summary: {
      depositsMinor: value("depositsMinor"), orderValueMinor, refundsMinor, netSalesMinor, capitalDeployedMinor,
      activeCapitalMinor: value("activeCapitalMinor"), grossProfitMinor,
      grossMarginBps: netSalesMinor > 0 ? Math.round(grossProfitMinor * 10_000 / netSalesMinor) : 0,
      walletLiabilityMinor: value("walletLiabilityMinor"), orderCount: value("orderCount"), completedOrders: value("completedOrders"),
    },
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
      providerOrderId: doc.get("providerOrderId"),
    }))
    .filter(
      (item) =>
        !filters.status ||
        filters.status === "all" ||
        item.status === filters.status,
    );
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
  const walletLiabilityMinor = walletAggregate ? Number(walletAggregate.data().total || 0) : 0;

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
