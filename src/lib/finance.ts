export const FINANCE_TIME_ZONE = "Africa/Lagos";
export const ACTIVE_FINANCE_ORDER_STATUSES = [
  "submitting",
  "provider_confirmation_required",
  "pending",
  "processing",
  "in_progress",
  "cancel_requested",
] as const;

export type FinanceOrder = { id: string; createdAt: Date | null; status: string; serviceName: string; category: string; quantity: number; customerPriceMinor: number; providerCostMinor: number; grossProfitMinor: number; refundedAmountMinor?: number; providerOrderId?: number; providerAccepted?: boolean; providerCostIncurredMinor?: number };
export type FinanceTransaction = { id: string; createdAt: Date | null; type: string; deltaMinor: number; currency: string; reference?: string };

export function providerCostIncurredMinor(order: Pick<FinanceOrder, "providerOrderId" | "providerAccepted" | "providerCostMinor" | "providerCostIncurredMinor">) {
  if (Number.isSafeInteger(order.providerCostIncurredMinor) && Number(order.providerCostIncurredMinor) >= 0) {
    return Number(order.providerCostIncurredMinor);
  }
  return order.providerAccepted === true || Number.isInteger(order.providerOrderId)
    ? Math.max(0, Number(order.providerCostMinor) || 0)
    : 0;
}

export function financeSummary(orders: FinanceOrder[], transactions: FinanceTransaction[], walletLiabilityMinor: number) {
  const orderValueMinor = orders.reduce((sum, item) => sum + item.customerPriceMinor, 0);
  const refundsMinor = transactions.filter((item) => item.currency === "NGN" && item.type === "refund").reduce((sum, item) => sum + Math.max(0, item.deltaMinor), 0);
  const depositsMinor = transactions.filter((item) => item.currency === "NGN" && item.type === "deposit").reduce((sum, item) => sum + Math.max(0, item.deltaMinor), 0);
  const capitalDeployedMinor = orders.reduce((sum, item) => sum + providerCostIncurredMinor(item), 0);
  const activeCapitalMinor = orders.filter((item) => ACTIVE_FINANCE_ORDER_STATUSES.includes(item.status as (typeof ACTIVE_FINANCE_ORDER_STATUSES)[number])).reduce((sum, item) => sum + providerCostIncurredMinor(item), 0);
  const netSalesMinor = orderValueMinor - refundsMinor;
  const grossProfitMinor = netSalesMinor - capitalDeployedMinor;
  return { depositsMinor, orderValueMinor, refundsMinor, netSalesMinor, capitalDeployedMinor, activeCapitalMinor, grossProfitMinor, grossMarginBps: netSalesMinor > 0 ? Math.round(grossProfitMinor * 10_000 / netSalesMinor) : null, walletLiabilityMinor, orderCount: orders.length, completedOrders: orders.filter((item) => item.status === "completed").length };
}

export function financePeriod(input: { range?: string; from?: string; to?: string }, now = new Date()) {
  const validDateKey = (value?: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const lagosKey = (value: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: FINANCE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
    const record = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${record.year}-${record.month}-${record.day}`;
  };
  const atStart = (key: string) => new Date(`${key}T00:00:00.000+01:00`);
  const atEnd = (key: string) => new Date(`${key}T23:59:59.999+01:00`);
  const toKey = validDateKey(input.to);
  const fromKey = validDateKey(input.from);
  const end = toKey ? atEnd(toKey) : now;
  let start: Date | null = fromKey ? atStart(fromKey) : null;
  if (!start && input.range !== "all") {
    const days = input.range === "today" ? 1 : input.range === "7d" ? 7 : input.range === "90d" ? 90 : 30;
    start = new Date(atStart(lagosKey(end)).getTime() - (days - 1) * 86_400_000);
  }
  return { start: start && !Number.isNaN(start.getTime()) ? start : null, end: !Number.isNaN(end.getTime()) ? end : now };
}
