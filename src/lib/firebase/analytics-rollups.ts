import "server-only";
import { AggregateField, FieldValue, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "./admin";
import { lagosDateKey } from "./stats";

export const ANALYTICS_GLOBAL = "global";
export const ANALYTICS_DAILY = "analyticsDaily";

type OrderRollupInput = { customerPriceMinor: number; providerCostMinor: number; grossProfitMinor: number };
type WalletRollupInput = { type: string; deltaMinor: number; currency: string };

function refs(date = new Date()) {
  const db = adminDb(), dateKey = lagosDateKey(date);
  return { global: db.collection("analytics").doc(ANALYTICS_GLOBAL), daily: db.collection(ANALYTICS_DAILY).doc(dateKey), dateKey };
}

/** Called inside the idempotent order-creation transaction. */
export function recordFinanceOrderCreated(transaction: Transaction, input: OrderRollupInput) {
  const { global, daily, dateKey } = refs();
  const values = {
    orderCount: FieldValue.increment(1), activeOrders: FieldValue.increment(1),
    orderValueMinor: FieldValue.increment(input.customerPriceMinor),
    capitalDeployedMinor: FieldValue.increment(input.providerCostMinor), activeCapitalMinor: FieldValue.increment(input.providerCostMinor),
    grossProfitMinor: FieldValue.increment(input.grossProfitMinor),
    updatedAt: FieldValue.serverTimestamp(),
  };
  transaction.set(global, values, { merge: true });
  transaction.set(daily, { ...values, dateKey }, { merge: true });
}

/** Called inside an idempotent wallet transaction, so every amount contributes once. */
export function recordWalletRollup(transaction: Transaction, input: WalletRollupInput) {
  if (input.currency !== "NGN") return;
  const { global, daily, dateKey } = refs();
  const values: Record<string, unknown> = { walletLiabilityMinor: FieldValue.increment(input.deltaMinor), updatedAt: FieldValue.serverTimestamp() };
  if (input.type === "deposit") values.depositsMinor = FieldValue.increment(input.deltaMinor);
  if (input.type === "refund") values.refundsMinor = FieldValue.increment(input.deltaMinor);
  transaction.set(global, values, { merge: true });
  transaction.set(daily, { ...values, dateKey }, { merge: true });
}

/** Status transitions use a deterministic event document to prevent duplicate rollups. */
export async function recordFinanceOrderStatus(orderId: string, previous: string, next: string, providerCostMinor = 0) {
  if (previous === next) return;
  const terminal = new Set(["completed", "failed", "cancelled", "partial", "refunded"]);
  const db = adminDb(), eventRef = db.collection("analyticsEvents").doc(`order_status_${orderId}_${next}`), { global, daily, dateKey } = refs();
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(eventRef);
    if (existing.exists) return;
    const values: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (!terminal.has(previous) && terminal.has(next)) {
      values.activeOrders = FieldValue.increment(-1);
      if (providerCostMinor > 0) values.activeCapitalMinor = FieldValue.increment(-providerCostMinor);
    }
    if (next === "completed") values.completedOrders = FieldValue.increment(1);
    if (next === "failed" || next === "cancelled") values.failedOrders = FieldValue.increment(1);
    transaction.create(eventRef, { orderId, previous, next, createdAt: FieldValue.serverTimestamp() });
    transaction.set(global, values, { merge: true });
    transaction.set(daily, { ...values, dateKey }, { merge: true });
  });
}

function num(value: unknown) { const parsed = Number(value || 0); return Number.isFinite(parsed) ? parsed : 0; }

/** One-time, admin-only bootstrap using aggregate indexes rather than document scans. */
export async function ensureFinanceRollups() {
  const db = adminDb(), ref = db.collection("analytics").doc(ANALYTICS_GLOBAL), current = await ref.get();
  if (current.get("initialized") === true) return (current.data() || {}) as Record<string, unknown>;
  const orders = db.collection("orders"), transactions = db.collection("walletTransactions"), wallets = db.collection("wallets");
  const [orderAgg, completed, failed, active, deposits, refunds, liability] = await Promise.all([
    orders.aggregate({ orderCount: AggregateField.count(), orderValueMinor: AggregateField.sum("customerPriceMinor"), capitalDeployedMinor: AggregateField.sum("providerCostMinor"), grossProfitMinor: AggregateField.sum("grossProfitMinor") }).get(),
    orders.where("status", "==", "completed").count().get(),
    orders.where("status", "in", ["failed", "cancelled"]).count().get(),
    orders.where("status", "in", ["pending", "processing", "in_progress", "submitting", "provider_confirmation_required", "cancel_requested"]).aggregate({ count: AggregateField.count(), capital: AggregateField.sum("providerCostMinor") }).get(),
    transactions.where("type", "==", "deposit").aggregate({ total: AggregateField.sum("deltaMinor") }).get(),
    transactions.where("type", "==", "refund").aggregate({ total: AggregateField.sum("deltaMinor") }).get(),
    wallets.where("currency", "==", "NGN").aggregate({ total: AggregateField.sum("availableMinor") }).get(),
  ]);
  const data = {
    initialized: true,
    orderCount: num(orderAgg.data().orderCount), orderValueMinor: num(orderAgg.data().orderValueMinor),
    capitalDeployedMinor: num(orderAgg.data().capitalDeployedMinor), grossProfitMinor: num(orderAgg.data().grossProfitMinor),
    completedOrders: num(completed.data().count), failedOrders: num(failed.data().count), activeOrders: num(active.data().count), activeCapitalMinor: num(active.data().capital),
    depositsMinor: num(deposits.data().total), refundsMinor: num(refunds.data().total), walletLiabilityMinor: num(liability.data().total),
    initializedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(data, { merge: true });
  return data as Record<string, unknown>;
}

export async function loadFinanceRollups(input: { start: Date | null; end: Date }) {
  const db = adminDb(), global = await ensureFinanceRollups();
  if (!input.start) return { summary: global, daily: [] as Array<Record<string, unknown>> };
  const startKey = lagosDateKey(input.start), endKey = lagosDateKey(input.end);
  const snapshot = await db.collection(ANALYTICS_DAILY).where("dateKey", ">=", startKey).where("dateKey", "<=", endKey).orderBy("dateKey").limit(100).get();
  const daily: Array<Record<string, unknown>> = snapshot.docs.map((doc) => ({ dateKey: doc.id, ...doc.data() }));
  const fields = ["orderCount", "orderValueMinor", "capitalDeployedMinor", "activeCapitalMinor", "grossProfitMinor", "completedOrders", "failedOrders", "activeOrders", "depositsMinor", "refundsMinor", "walletLiabilityMinor"];
  const summary: Record<string, unknown> = { initialized: true };
  for (const field of fields) summary[field] = daily.reduce((sum, row) => sum + num(row[field]), 0);
  // Liability is a point-in-time metric and always comes from the global rollup.
  summary.walletLiabilityMinor = num(global.walletLiabilityMinor);
  return { summary, daily };
}

export async function loadCustomerGrowthDays(startKey: string, endKey: string) {
  const snapshot = await adminDb().collection(ANALYTICS_DAILY).where("dateKey", ">=", startKey).where("dateKey", "<=", endKey).orderBy("dateKey").limit(370).get();
  return Object.fromEntries(snapshot.docs.map((doc) => [doc.id, num(doc.get("newCustomers"))]));
}
