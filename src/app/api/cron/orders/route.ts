import { timingSafeEqual } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getProvider, normalizeProviderKey } from "@/lib/providers";
import { synchronizeOrderDocuments } from "@/lib/order-sync";
import { expireAwaitingCryptoDeposits, reverifyPendingCryptoDeposits } from "@/lib/payments/crypto-reconcile";
import { createCustomerNotification } from "@/lib/customer-notifications";
import { providerReviewAlertStage, providerReviewStageRank, type ProviderReviewAlertStage } from "@/lib/provider-review-policy";
import { sendAdminAlert } from "@/lib/email";

function valid(request: Request) { const expected = process.env.CRON_SECRET || "", supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") || ""; return expected.length === supplied.length && expected.length > 0 && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)); }

export async function GET(request: Request) {
  if (!valid(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = adminDb();
  const reviewCutoff = Timestamp.fromMillis(Date.now() - 15 * 60 * 1000);
  const [orderSnapshot, refillSnapshot, reviewSnapshot] = await Promise.all([
    db.collection("orders").where("status", "in", ["pending", "processing", "in_progress", "cancel_requested"]).limit(100).get(),
    db.collection("refills").where("status", "in", ["pending", "processing"]).limit(100).get(),
    db.collection("orders").where("status", "==", "provider_confirmation_required").where("createdAt", "<=", reviewCutoff).orderBy("createdAt", "asc").limit(50).get(),
  ]);
  const orders = orderSnapshot.docs.filter((doc) => Number.isInteger(doc.get("providerOrderId")));
  const orderResult = await synchronizeOrderDocuments(orders, true);
  let refillsUpdated = 0;

  const refills = refillSnapshot.docs.filter((doc) => Number.isInteger(doc.get("providerRefillId")));
  const refillGroups = new Map<string, typeof refills>();
  for (const doc of refills) { const key = normalizeProviderKey(doc.get("providerKey")); refillGroups.set(key, [...(refillGroups.get(key) || []), doc]); }
  for (const [key, docs] of refillGroups) {
    const provider = getProvider(key); if (!provider.configured) continue;
    const statuses = await provider.client.refillStatuses(docs.map((doc) => doc.get("providerRefillId")));
    for (const doc of docs) { const result = statuses[String(doc.get("providerRefillId"))]; if (!result || result.status === doc.get("status")) continue; await doc.ref.set({ status: result.status.toLowerCase().replaceAll(" ", "_"), providerStatus: result.status, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); refillsUpdated += 1; await createCustomerNotification({ userId: doc.get("userId"), type: "refill_status", title: `Refill ${result.status}`, orderId: doc.get("orderId") }); }
  }
  const reminderMinutes = Math.max(15, Number(process.env.PROVIDER_CONFIRMATION_REMINDER_MINUTES || 60));
  const escalationHours = Math.max(1, Number(process.env.PROVIDER_CONFIRMATION_ESCALATION_HOURS || 24));
  let reviewReminders = 0, reviewEscalations = 0;
  for (const doc of reviewSnapshot.docs) {
    const createdAt = doc.get("createdAt")?.toMillis?.();
    if (!Number.isFinite(createdAt)) continue;
    const nextStage = providerReviewAlertStage(Date.now() - createdAt, reminderMinutes, escalationHours);
    const currentStage = String(doc.get("providerReviewAlertStage") || "none") as ProviderReviewAlertStage;
    if (providerReviewStageRank[nextStage] <= (providerReviewStageRank[currentStage] ?? 0)) continue;
    await doc.ref.set({ providerReviewAlertStage: nextStage, providerReviewAlertedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await db.collection("auditLogs").doc(`provider-review-${nextStage}:${doc.id}`).set({ action: `provider_confirmation_${nextStage}`, targetType: "order", targetId: doc.id, createdAt: FieldValue.serverTimestamp(), actorUid: "cron" }, { merge: true });
    if (nextStage === "escalation") reviewEscalations += 1; else reviewReminders += 1;
  }
  if (reviewReminders || reviewEscalations) {
    const dateBucket = new Date().toISOString().slice(0, 10);
    await sendAdminAlert({ subject: "Provider confirmation queue requires review", title: "Aged provider confirmations", message: `${reviewReminders} order(s) reached the review reminder and ${reviewEscalations} reached escalation. The job did not resubmit any provider order.`, buttonLabel: "Open recovery queue", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/admin/provider`, idempotencyKey: `provider-review-cron-${dateBucket}-${reviewReminders}-${reviewEscalations}` }).catch(() => undefined);
  }
  const [crypto, expiredCrypto] = await Promise.all([reverifyPendingCryptoDeposits(), expireAwaitingCryptoDeposits()]);
  return Response.json({ ok: true, updated: orderResult.updated, checked: orderResult.checked, refillsUpdated, refillsChecked: refills.length, providerReviews: { checked: reviewSnapshot.size, reminders: reviewReminders, escalations: reviewEscalations, resubmitted: 0 }, crypto, expiredCrypto });
}
