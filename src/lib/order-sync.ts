import { FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "./firebase/admin";
import { postWallet } from "./firebase/wallet";
import { serviceCostMinor } from "./money";
import { FollowsPanelClient } from "./providers/followspanel";
import { verifiedProviderStatus } from "./order-status";
import { sendUserEmail } from "./email";

const ACTIVE_STATUSES = ["pending", "processing", "in_progress", "cancel_requested"];
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
  const statuses = await new FollowsPanelClient().statuses(eligible.map((doc) => doc.get("providerOrderId")));
  let updated = 0;
  for (const doc of eligible) {
    const provider = statuses[String(doc.get("providerOrderId"))];
    if (!provider) continue;
    const startCount = integer(provider.start_count);
    const remains = integer(provider.remains);
    const status = verifiedProviderStatus(provider.status, startCount, remains);
    const previous = doc.get("status");
    console.info("[order-sync] provider status", { orderId: doc.id, providerOrderId: doc.get("providerOrderId"), providerStatus: provider.status, resolvedStatus: status, startCount, remains });
    const update: Record<string, unknown> = { status, providerStatus: provider.status, providerCharge: provider.charge || null, lastProviderUpdate: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    if (startCount !== null) update.startCount = startCount;
    if (remains !== null) update.remains = remains;
    await doc.ref.set(update, { merge: true });
    if (status !== previous) {
      updated += 1;
      await db.collection("orderEvents").add({ orderId: doc.id, userId: doc.get("userId"), status, previousStatus: previous, createdAt: FieldValue.serverTimestamp() });
      await db.collection("notifications").add({ userId: doc.get("userId"), type: "order_status", title: `Order ${status.replaceAll("_", " ")}`, orderId: doc.id, read: false, createdAt: FieldValue.serverTimestamp() });
      if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) await sendUserEmail(String(doc.get("userId")), { subject: `Order update: ${status.replaceAll("_", " ")}`, title: "Your order status has changed", message: `Order #${doc.id.slice(0, 8)} is now ${status.replaceAll("_", " ")}. Sign in to review the latest delivery progress.`, buttonLabel: "View order", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/dashboard/orders/${doc.id}` }).catch((error) => console.warn("[order-email] delivery failed", { orderId: doc.id, error: error instanceof Error ? error.message : "Unknown error" }));
    }
    if (["failed", "cancelled", "partial"].includes(status)) {
      const quantity = integer(String(doc.get("quantity") ?? "")) || 0;
      const sellingRateMinor = integer(String(doc.get("sellingRateMinor") ?? "")) || 0;
      const customerPriceMinor = integer(String(doc.get("customerPriceMinor") ?? "")) || 0;
      const refundableQuantity = status === "partial" ? BigInt(remains || 0) : BigInt(quantity);
      const refund = Number(serviceCostMinor(BigInt(sellingRateMinor), refundableQuantity));
      if (refund > 0 && customerPriceMinor > 0) await postWallet({ userId: doc.get("userId"), type: "refund", deltaMinor: Math.min(refund, customerPriceMinor), currency: String(doc.get("currency") || "NGN"), idempotencyKey: `status-refund:${doc.id}`, reference: doc.id, reason: `Order ${status}` });
    }
  }
  return { checked: eligible.length, updated };
}

export async function synchronizeUserOrders(userId: string, force = false) {
  const snapshot = await adminDb().collection("orders").where("userId", "==", userId).limit(100).get();
  const eligible = force ? snapshot.docs.filter((doc) => Number.isInteger(doc.get("providerOrderId"))) : snapshot.docs.filter((doc) => ACTIVE_STATUSES.includes(String(doc.get("status"))));
  return synchronizeOrderDocuments(eligible, force);
}
