import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase/admin";
import { postWallet } from "./firebase/wallet";
import { serviceCostMinor } from "./money";
import { serviceSellingRateNgnMinor } from "./currency";
import { FollowsPanelClient, ProviderError } from "./providers/followspanel";

export type NewOrder = { userId: string; serviceId: string; link: string; quantity: number; idempotencyKey: string };
export async function createAndSubmitOrder(input: NewOrder) {
  if (process.env.ORDER_SUBMISSION_ENABLED !== "true") throw new Error("Order submission is not enabled");
  if (!/^\d+$/.test(input.serviceId) || !Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error("Invalid order");
  const url = new URL(input.link); if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Invalid target URL");
  const db = adminDb(), orderRef = db.collection("orders").doc(input.idempotencyKey), walletRef = db.collection("wallets").doc(input.userId), serviceRef = db.collection("services").doc(input.serviceId);
  const local = await db.runTransaction(async (transaction) => {
    const [existing, wallet, service] = await Promise.all([transaction.get(orderRef), transaction.get(walletRef), transaction.get(serviceRef)]);
    if (existing.exists) return existing.data()!;
    if (!service.exists || service.get("active") !== true) throw new Error("Service is unavailable");
    const data = service.data()!;
    if (input.quantity < data.minQuantity || input.quantity > data.maxQuantity) throw new Error("Quantity is outside service limits");
    const providerCostMinor = Number(serviceCostMinor(BigInt(data.providerRateMinor), BigInt(input.quantity)));
    const convertedProviderCostMinor = providerCostMinor;
    const sellingRateMinor = serviceSellingRateNgnMinor(data);
    const customerPriceMinor = Number(serviceCostMinor(sellingRateMinor, BigInt(input.quantity)));
    const available = wallet.exists ? Number(wallet.get("availableMinor") ?? wallet.get("balanceMinor") ?? 0) : 0, currency = wallet.exists ? String(wallet.get("currency") || "USD") : "USD";
    if (currency !== "NGN") throw new Error("This service requires a naira wallet");
    if (available < customerPriceMinor) throw new Error("Insufficient wallet balance");
    const next = available - customerPriceMinor, walletTransactionId = `order:${input.idempotencyKey}`;
    transaction.set(walletRef, { availableMinor: next, balanceMinor: next, version: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.create(db.collection("walletTransactions").doc(walletTransactionId), { userId: input.userId, type: "order_debit", deltaMinor: -customerPriceMinor, currency, idempotencyKey: walletTransactionId, reference: orderRef.id, balanceBeforeMinor: available, balanceAfterMinor: next, status: "posted", createdAt: FieldValue.serverTimestamp() });
    transaction.create(db.collection("walletLedger").doc(walletTransactionId), { walletUserId: input.userId, transactionId: walletTransactionId, type: "order_debit", deltaMinor: -customerPriceMinor, currency, balanceBeforeMinor: available, balanceAfterMinor: next, reference: orderRef.id, createdAt: FieldValue.serverTimestamp() });
    const grossProfitMinor = customerPriceMinor - convertedProviderCostMinor;
    const order = { userId: input.userId, serviceId: input.serviceId, serviceName: data.name, providerServiceId: data.providerServiceId, link: input.link, quantity: input.quantity, currency, sellingRateMinor: Number(sellingRateMinor), providerCurrency: "NGN", providerRateMinor: data.providerRateMinor, providerCostMinor, convertedProviderCostMinor, customerPriceMinor, grossProfitMinor, markupBps: data.markupBps ?? 4000, grossMarginBps: Math.floor(grossProfitMinor * 10000 / customerPriceMinor), pricingModel: "ngn_markup_v1", refillSupported: data.refillSupported, cancelSupported: data.cancelSupported, status: "submitting", idempotencyKey: input.idempotencyKey, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    transaction.create(orderRef, order); transaction.create(db.collection("orderEvents").doc(), { orderId: orderRef.id, userId: input.userId, status: "submitting", createdAt: FieldValue.serverTimestamp() });
    return order;
  });
  if (("providerOrderId" in local && local.providerOrderId) || local.status !== "submitting") return { id: orderRef.id, status: local.status };
  try {
    const result = await new FollowsPanelClient().add(Number(local.providerServiceId), input.link, input.quantity);
    console.info("[order-submit] provider accepted", { orderId: orderRef.id, providerOrderId: result.order, providerServiceId: local.providerServiceId, quantity: input.quantity });
    await orderRef.set({ providerOrderId: result.order, status: "pending", submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await db.collection("orderEvents").add({ orderId: orderRef.id, userId: input.userId, status: "pending", createdAt: FieldValue.serverTimestamp() });
    return { id: orderRef.id, status: "pending" };
  } catch (error) {
    const definitelyRejected = error instanceof ProviderError && ["NOT_CONFIGURED", "UPSTREAM_REJECTED"].includes(error.code);
    const status = definitelyRejected ? "failed" : "provider_confirmation_required";
    await orderRef.set({ status, providerErrorCode: error instanceof ProviderError ? error.code : "NETWORK", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (definitelyRejected) await postWallet({ userId: input.userId, type: "refund", deltaMinor: local.customerPriceMinor, currency: local.currency, idempotencyKey: `refund:${orderRef.id}`, reference: orderRef.id, reason: "Provider rejected order submission" });
    return { id: orderRef.id, status };
  }
}
export const newOrderId = () => randomUUID();
