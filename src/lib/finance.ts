export type FinanceOrder = { id: string; createdAt: Date | null; status: string; serviceName: string; category: string; quantity: number; customerPriceMinor: number; providerCostMinor: number; grossProfitMinor: number; providerOrderId?: number };
export type FinanceTransaction = { id: string; createdAt: Date | null; type: string; deltaMinor: number; currency: string; reference?: string };

export function financeSummary(orders: FinanceOrder[], transactions: FinanceTransaction[], walletLiabilityMinor: number) {
  const orderValueMinor = orders.reduce((sum, item) => sum + item.customerPriceMinor, 0);
  const refundsMinor = transactions.filter((item) => item.type === "refund").reduce((sum, item) => sum + Math.max(0, item.deltaMinor), 0);
  const depositsMinor = transactions.filter((item) => item.type === "deposit").reduce((sum, item) => sum + Math.max(0, item.deltaMinor), 0);
  const capitalDeployedMinor = orders.filter((item) => Number.isInteger(item.providerOrderId)).reduce((sum, item) => sum + item.providerCostMinor, 0);
  const activeCapitalMinor = orders.filter((item) => Number.isInteger(item.providerOrderId) && ["pending", "processing", "in_progress", "cancel_requested"].includes(item.status)).reduce((sum, item) => sum + item.providerCostMinor, 0);
  const netSalesMinor = Math.max(0, orderValueMinor - refundsMinor);
  const grossProfitMinor = netSalesMinor - capitalDeployedMinor;
  return { depositsMinor, orderValueMinor, refundsMinor, netSalesMinor, capitalDeployedMinor, activeCapitalMinor, grossProfitMinor, grossMarginBps: netSalesMinor > 0 ? Math.round(grossProfitMinor * 10_000 / netSalesMinor) : 0, walletLiabilityMinor, orderCount: orders.length, completedOrders: orders.filter((item) => item.status === "completed").length };
}

export function financePeriod(input: { range?: string; from?: string; to?: string }, now = new Date()) {
  const end = input.to ? new Date(`${input.to}T23:59:59.999Z`) : now;
  let start: Date | null = input.from ? new Date(`${input.from}T00:00:00.000Z`) : null;
  if (!start && input.range !== "all") { const days = input.range === "today" ? 1 : input.range === "7d" ? 7 : input.range === "90d" ? 90 : 30; start = new Date(end.getTime() - days * 86_400_000); }
  return { start: start && !Number.isNaN(start.getTime()) ? start : null, end: !Number.isNaN(end.getTime()) ? end : now };
}
