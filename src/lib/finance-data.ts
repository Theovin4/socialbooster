import { adminDb } from "./firebase/admin";
import { financePeriod, type FinanceOrder, type FinanceTransaction } from "./finance";

function date(value: unknown) { return (value as { toDate?: () => Date })?.toDate?.() || null; }
export async function loadFinanceData(filters: { range?: string; from?: string; to?: string; status?: string }) {
  const db = adminDb();
  const [ordersSnapshot, transactionsSnapshot, walletsSnapshot] = await Promise.all([db.collection("orders").limit(5000).get(), db.collection("walletTransactions").limit(5000).get(), db.collection("wallets").limit(5000).get()]);
  const period = financePeriod(filters);
  const inPeriod = (value: Date | null) => Boolean(value && (!period.start || value >= period.start) && value <= period.end);
  const orders: FinanceOrder[] = ordersSnapshot.docs.map((doc) => ({ id: doc.id, createdAt: date(doc.get("createdAt")), status: String(doc.get("status") || "unknown"), serviceName: String(doc.get("serviceName") || "Unknown service"), category: String(doc.get("categoryName") || doc.get("serviceName") || "Other").split(/[|\[]/)[0].trim(), quantity: Number(doc.get("quantity") || 0), customerPriceMinor: Number(doc.get("customerPriceMinor") || 0), providerCostMinor: Number(doc.get("providerCostMinor") || 0), grossProfitMinor: Number(doc.get("grossProfitMinor") || 0), providerOrderId: doc.get("providerOrderId") })).filter((item) => inPeriod(item.createdAt) && (!filters.status || filters.status === "all" || item.status === filters.status));
  const transactions: FinanceTransaction[] = transactionsSnapshot.docs.map((doc) => ({ id: doc.id, createdAt: date(doc.get("createdAt")), type: String(doc.get("type") || "unknown"), deltaMinor: Number(doc.get("deltaMinor") || 0), currency: String(doc.get("currency") || "NGN"), reference: String(doc.get("reference") || "") })).filter((item) => item.currency === "NGN" && inPeriod(item.createdAt));
  const walletLiabilityMinor = walletsSnapshot.docs.filter((doc) => String(doc.get("currency") || "NGN") === "NGN").reduce((sum, doc) => sum + Number(doc.get("availableMinor") ?? doc.get("balanceMinor") ?? 0), 0);
  return { orders, transactions, walletLiabilityMinor, period };
}
