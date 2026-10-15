import {
  ACTIVE_FINANCE_ORDER_STATUSES,
  providerCostIncurredMinor,
  type FinanceOrder,
  type FinanceTransaction,
} from "./finance";

export const FINANCE_ROLLUP_VERSION = 2;

export type FinanceOrderMetrics = {
  orderCount: number;
  orderValueMinor: number;
  capitalDeployedMinor: number;
  activeCapitalMinor: number;
  completedOrders: number;
  failedOrders: number;
  activeOrders: number;
};

export type FinanceRollupMetrics = FinanceOrderMetrics & {
  depositsMinor: number;
  refundsMinor: number;
  walletLiabilityMinor: number;
};

export type FinanceDailyMetrics = FinanceRollupMetrics & {
  dateKey: string;
  byStatus: Record<string, FinanceOrderMetrics>;
};

export function emptyOrderMetrics(): FinanceOrderMetrics {
  return {
    orderCount: 0,
    orderValueMinor: 0,
    capitalDeployedMinor: 0,
    activeCapitalMinor: 0,
    completedOrders: 0,
    failedOrders: 0,
    activeOrders: 0,
  };
}

export function emptyFinanceMetrics(): FinanceRollupMetrics {
  return {
    ...emptyOrderMetrics(),
    depositsMinor: 0,
    refundsMinor: 0,
    walletLiabilityMinor: 0,
  };
}

function safeMoney(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function addOrderMetrics(target: FinanceOrderMetrics, order: FinanceOrder) {
  const cost = providerCostIncurredMinor(order);
  const active = ACTIVE_FINANCE_ORDER_STATUSES.includes(order.status as (typeof ACTIVE_FINANCE_ORDER_STATUSES)[number]);
  target.orderCount += 1;
  target.orderValueMinor += safeMoney(order.customerPriceMinor);
  target.capitalDeployedMinor += cost;
  target.activeCapitalMinor += active ? cost : 0;
  target.completedOrders += order.status === "completed" ? 1 : 0;
  target.failedOrders += ["failed", "cancelled"].includes(order.status) ? 1 : 0;
  target.activeOrders += active ? 1 : 0;
}

export function addOrderToFinanceMetrics(target: FinanceRollupMetrics, order: FinanceOrder) {
  addOrderMetrics(target, order);
}

export function addOrderToDailyMetrics(target: FinanceDailyMetrics, order: FinanceOrder) {
  addOrderMetrics(target, order);
  const status = order.status || "unknown";
  const statusMetrics = target.byStatus[status] || emptyOrderMetrics();
  addOrderMetrics(statusMetrics, order);
  target.byStatus[status] = statusMetrics;
}

export function addTransactionToFinanceMetrics(target: FinanceRollupMetrics, transaction: FinanceTransaction) {
  if (transaction.currency !== "NGN") return;
  const amount = safeMoney(transaction.deltaMinor);
  if (transaction.type === "deposit") target.depositsMinor += amount;
  if (transaction.type === "refund") target.refundsMinor += amount;
}

export function newDailyMetrics(dateKey: string): FinanceDailyMetrics {
  return { dateKey, ...emptyFinanceMetrics(), byStatus: {} };
}

export function summaryForStatus(
  metrics: FinanceRollupMetrics & { byStatus?: Record<string, FinanceOrderMetrics> },
  status: string,
) {
  if (!status || status === "all") return metrics;
  const statusMetrics = metrics.byStatus?.[status] || emptyOrderMetrics();
  return {
    ...statusMetrics,
    depositsMinor: metrics.depositsMinor,
    refundsMinor: metrics.refundsMinor,
    walletLiabilityMinor: metrics.walletLiabilityMinor,
  };
}

export function orderStatusTransitionDelta(previous: string, next: string, providerCostIncurredMinor: number) {
  const wasActive = ACTIVE_FINANCE_ORDER_STATUSES.includes(previous as (typeof ACTIVE_FINANCE_ORDER_STATUSES)[number]);
  const nextActive = ACTIVE_FINANCE_ORDER_STATUSES.includes(next as (typeof ACTIVE_FINANCE_ORDER_STATUSES)[number]);
  const wasFailed = ["failed", "cancelled"].includes(previous);
  const nextFailed = ["failed", "cancelled"].includes(next);
  return {
    activeOrders: Number(nextActive) - Number(wasActive),
    activeCapitalMinor: (Number(nextActive) - Number(wasActive)) * safeMoney(providerCostIncurredMinor),
    completedOrders: Number(next === "completed") - Number(previous === "completed"),
    failedOrders: Number(nextFailed) - Number(wasFailed),
  };
}
