import { FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "./firebase/admin";
import { postWallet } from "./firebase/wallet";
import { serviceCostMinor } from "./money";
import { getProvider, normalizeProviderKey } from "./providers";
import { verifiedProviderStatus } from "./order-status";
import { sendUserEmail } from "./email";
import { orderStatusEmailCopy, shouldSendOrderStatusEmail } from "./order-email-policy";
import { terminalRefundDecision } from "./order-refund-policy";
import { recordCompletedOrderMarketing } from "./marketing-profile";

const STALE_AFTER_MS = 60_000;

function integer(value: string | undefined) {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function synchronizeOrderDocuments(documents: DocumentSnapshot[], force = false) {
  const now = Date.now();
  const eligible = documents.filter((doc) => {
    if (!Number.isInteger(doc.get("providerOrderId"))) return false;
    if (force) return true;
    const updated = doc.get("lastProviderUpdate")?.toMillis?.() || 0;
    return now - updated >= STALE_AFTER_MS;
  });
  if (!eligible.length) return { checked: 0, updated: 0 };
  const db = adminDb();
  const grouped = new Map<string, DocumentSnapshot[]>();
  for (const doc of eligible) {
    const key = normalizeProviderKey(doc.get("providerKey"));
    grouped.set(key, [...(grouped.get(key) || []), doc]);
  }
  const statusesByProvider = new Map<string, Record<string, { charge?: string; start_count?: string; status: string; remains?: string; currency?: string }>>();
  await Promise.all(Array.from(grouped.entries()).map(async ([key, docs]) => {
    const provider = getProvider(key);
    if (!provider.configured) { console.warn("[order-sync] provider not configured", { providerKey: key, orderCount: docs.length }); return; }
    try { statusesByProvider.set(key, await provider.client.statuses(docs.map((doc) => Number(doc.get("providerOrderId"))))); }
    catch (error) { console.error("[order-sync] provider status failed", { providerKey: key, orderCount: docs.length, error: error instanceof Error ? error.message : String(error) }); }
  }));
  let updated = 0;
  for (const doc of eligible) {
    const providerKey = normalizeProviderKey(doc.get("providerKey"));
    const provider = statusesByProvider.get(providerKey)?.[String(doc.get("providerOrderId"))];
    if (!provider) continue;
    const startCount = integer(provider.start_count);
    const remains = integer(provider.remains);
    const candidateStatus = verifiedProviderStatus(provider.status, startCount, remains);
    const previous = doc.get("status");
    const quantity = integer(String(doc.get("quantity") ?? "")) || 0;
    const firstObservedAtMs = doc.get("refundReviewFirstSeenAt")?.toMillis?.() || null;
    const refundDecision = terminalRefundDecision({ status: candidateStatus, quantity, remains, previousObservation: doc.get("refundReviewStatus") || null, firstObservedAtMs, nowMs: now });
    const status = ["stage", "hold", "reject"].includes(refundDecision) ? previous : candidateStatus;
    console.info("[order-sync] provider status", { orderId: doc.id, providerKey, providerOrderId: doc.get("providerOrderId"), providerStatus: provider.status, resolvedStatus: candidateStatus, persistedStatus: status, refundDecision, startCount, remains });
    const update: Record<string, unknown> = { status, providerStatus: provider.status, providerCharge: provider.charge || null, lastProviderUpdate: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    if (refundDecision === "stage") Object.assign(update, { refundReviewStatus: candidateStatus, refundReviewFirstSeenAt: FieldValue.serverTimestamp(), refundReviewConfirmations: 1 });
    if (refundDecision === "hold") update.refundReviewConfirmations = FieldValue.increment(1);
    if (refundDecision === "confirm") Object.assign(update, { refundReviewConfirmedAt: FieldValue.serverTimestamp(), refundReviewConfirmations: FieldValue.increment(1) });
    if (refundDecision === "reject") Object.assign(update, { refundReviewRejectedAt: FieldValue.serverTimestamp(), refundReviewReason: "Provider terminal response did not include valid refundable quantities" });
    if (refundDecision === "none") Object.assign(update, { refundReviewStatus: FieldValue.delete(), refundReviewFirstSeenAt: FieldValue.delete(), refundReviewConfirmations: FieldValue.delete(), refundReviewReason: FieldValue.delete() });
    if (startCount !== null) update.startCount = startCount;
    if (remains !== null) update.remains = remains;
    await doc.ref.set(update, { merge: true });
    if (status !== previous) {
      updated += 1;
      await db.collection("orderEvents").add({ orderId: doc.id, userId: doc.get("userId"), status, previousStatus: previous, createdAt: FieldValue.serverTimestamp() });
      await db.collection("notifications").add({ userId: doc.get("userId"), type: "order_status", title: `Order ${status.replaceAll("_", " ")}`, orderId: doc.id, read: false, createdAt: FieldValue.serverTimestamp() });
      const routineEmailCount = Number(doc.get("customerRoutineEmailCount") || 0);
      if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM && shouldSendOrderStatusEmail(status, routineEmailCount)) {
        const copy = orderStatusEmailCopy(status, doc.id.slice(0, 8));
        await sendUserEmail(String(doc.get("userId")), { ...copy, buttonLabel: "View order", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/dashboard/orders/${doc.id}` }).then(() => doc.ref.set({ ...(status === "completed" ? { customerRoutineEmailCount: FieldValue.increment(1) } : {}), lastCustomerEmailStatus: status, lastCustomerEmailAt: FieldValue.serverTimestamp() }, { merge: true })).catch((error) => console.warn("[order-email] delivery failed", { orderId: doc.id, error: error instanceof Error ? error.message : "Unknown error" }));
      }
      if (status === "completed") await recordCompletedOrderMarketing(doc.id).catch((error) => console.warn("[order-marketing-profile] completion update failed", { orderId: doc.id, error: error instanceof Error ? error.message : "Unknown error" }));
    }
    if (["stage", "reject"].includes(refundDecision)) await db.collection("auditLogs").add({ action: refundDecision === "stage" ? "order_refund_staged" : "order_refund_evidence_rejected", targetType: "order", targetId: doc.id, providerKey, providerOrderId: doc.get("providerOrderId"), candidateStatus, startCount, remains, quantity, createdAt: FieldValue.serverTimestamp() });
    if (refundDecision === "confirm") {
      const sellingRateMinor = integer(String(doc.get("sellingRateMinor") ?? "")) || 0;
      const customerPriceMinor = integer(String(doc.get("customerPriceMinor") ?? "")) || 0;
      const refundableQuantity = candidateStatus === "partial" ? BigInt(remains || 0) : BigInt(quantity);
      const refund = Number(serviceCostMinor(BigInt(sellingRateMinor), refundableQuantity));
      if (refund > 0 && customerPriceMinor > 0) {
        const amount = Math.min(refund, customerPriceMinor);
        const result = await postWallet({ userId: doc.get("userId"), type: "refund", deltaMinor: amount, currency: String(doc.get("currency") || "NGN"), idempotencyKey: `status-refund:${doc.id}`, reference: doc.id, reason: `Order ${candidateStatus} after confirmed provider status` });
        await db.collection("auditLogs").add({ action: "order_refund_confirmed", targetType: "order", targetId: doc.id, providerKey, providerOrderId: doc.get("providerOrderId"), candidateStatus, amountMinor: amount, duplicate: result.duplicate, createdAt: FieldValue.serverTimestamp() });
      }
    }
  }
  return { checked: eligible.length, updated };
}
