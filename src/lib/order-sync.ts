import { FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "./firebase/admin";
import { postWallet } from "./firebase/wallet";
import { serviceCostMinor } from "./money";
import { getProvider, normalizeProviderKey } from "./providers";
import { mapProviderStatus, verifiedProviderStatus } from "./order-status";
import { sendUserEmail } from "./email";
import { orderStatusEmailCopy, shouldSendOrderStatusEmail } from "./order-email-policy";
import { remainingRefundAmount, statusDuringRefundConfirmation, terminalRefundDecision } from "./order-refund-policy";
import { recordCompletedOrderMarketing } from "./marketing-profile";
import { recordFinanceOrderStatus } from "./firebase/analytics-rollups";
import { lagosDateKey } from "./firebase/stats";
import { createCustomerNotification } from "./customer-notifications";
import { providerConfirmationRefundKeys } from "./provider-confirmation-recovery";
import { nonNegativeInteger, orderProgress } from "./order-tracking";
import { boundedBatches } from "./active-order-pages";

const STALE_AFTER_MS = 60_000;
const PROVIDER_STATUS_BATCH_SIZE = 100;

export type ProviderStatusResult = {
  charge?: string;
  start_count?: string;
  status: string;
  remains?: string;
  currency?: string;
};

export type PrefetchedProviderStatuses = Map<string, Record<string, ProviderStatusResult>>;

export type OrderSynchronizationResult = {
  checked: number;
  attempted: number;
  updated: number;
  providerBatches: number;
  providerFailures: number;
  checkedByProvider: Record<string, number>;
  transitions: Record<string, number>;
  processedOrderIds: string[];
  statusByOrder: Record<string, string>;
};

/** Shared provider-status persistence for cron, admin, customer and recovery paths. */
export async function synchronizeOrderDocuments(
  documents: DocumentSnapshot[],
  force = false,
  prefetchedStatuses?: PrefetchedProviderStatuses,
) {
  const now = Date.now();
  const eligible = documents.filter((doc) => {
    if (!Number.isInteger(doc.get("providerOrderId"))) return false;
    if (force) return true;
    const updated = doc.get("lastProviderUpdate")?.toMillis?.() || 0;
    return now - updated >= STALE_AFTER_MS;
  });
  if (!eligible.length) return { checked: 0, attempted: 0, updated: 0, providerBatches: 0, providerFailures: 0, checkedByProvider: {}, transitions: {}, processedOrderIds: [], statusByOrder: {} } satisfies OrderSynchronizationResult;

  const db = adminDb();
  const grouped = new Map<string, DocumentSnapshot[]>();
  for (const doc of eligible) {
    const key = normalizeProviderKey(doc.get("providerKey"));
    grouped.set(key, [...(grouped.get(key) || []), doc]);
  }

  const statusesByProvider = new Map<string, Record<string, ProviderStatusResult>>();
  let providerBatches = 0, providerFailures = 0;
  await Promise.all(Array.from(grouped.entries()).map(async ([key, docs]) => {
    const supplied = prefetchedStatuses?.get(key) || {};
    const missingIds = docs
      .map((doc) => Number(doc.get("providerOrderId")))
      .filter((id) => !supplied[String(id)]);
    const provider = getProvider(key);
    if (!provider.configured && missingIds.length) {
      console.warn("[order-sync] provider not configured", { providerKey: key, orderCount: missingIds.length });
      providerFailures += 1;
      if (Object.keys(supplied).length) statusesByProvider.set(key, supplied);
      return;
    }
    const combined: Record<string, ProviderStatusResult> = { ...supplied };
    for (const ids of boundedBatches(missingIds, PROVIDER_STATUS_BATCH_SIZE)) {
      providerBatches += 1;
      try {
        Object.assign(combined, await provider.client.statuses(ids));
      } catch (error) {
        providerFailures += 1;
        console.error("[order-sync] provider status batch failed", { providerKey: key, orderCount: ids.length, error: error instanceof Error ? error.message : String(error) });
      }
    }
    if (Object.keys(combined).length) statusesByProvider.set(key, combined);
  }));

  let checked = 0, updated = 0;
  const checkedByProvider: Record<string, number> = {};
  const transitions: Record<string, number> = {};
  const processedOrderIds: string[] = [];
  const statusByOrder: Record<string, string> = {};
  for (const doc of eligible) {
    const providerKey = normalizeProviderKey(doc.get("providerKey"));
    const providerOrderId = Number(doc.get("providerOrderId"));
    const provider = statusesByProvider.get(providerKey)?.[String(providerOrderId)];
    if (!provider) continue;
    checked += 1;
    checkedByProvider[providerKey] = (checkedByProvider[providerKey] || 0) + 1;

    const startCount = nonNegativeInteger(provider.start_count);
    const remains = nonNegativeInteger(provider.remains);
    const completionFirstSeenAtMs = doc.get("completionReviewFirstSeenAt")?.toMillis?.() || null;
    const candidateStatus = verifiedProviderStatus(provider.status, startCount, remains, {
      previousObservation: doc.get("completionReviewStatus") || null,
      firstObservedAtMs: completionFirstSeenAtMs,
      nowMs: now,
    });
    const previous = String(doc.get("status") || "pending");
    const quantity = nonNegativeInteger(doc.get("quantity")) || 0;
    const firstObservedAtMs = doc.get("refundReviewFirstSeenAt")?.toMillis?.() || null;
    const refundDecision = doc.get("refundStatus") === "posted"
      ? "none"
      : terminalRefundDecision({ status: candidateStatus, quantity, remains, previousObservation: doc.get("refundReviewStatus") || null, firstObservedAtMs, nowMs: now });
    const status = statusDuringRefundConfirmation(candidateStatus, previous, refundDecision);
    const effectiveRemains = remains ?? nonNegativeInteger(doc.get("remains"));
    const progress = orderProgress({ quantity, remains: effectiveRemains, status });
    console.info("[order-sync] provider status", { orderId: doc.id, providerKey, providerOrderId, providerStatus: provider.status, resolvedStatus: candidateStatus, persistedStatus: status, refundDecision, startCount, remains });

    const update: Record<string, unknown> = {
      status,
      providerStatus: provider.status,
      providerCharge: provider.charge || null,
      lastProviderUpdate: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    const needsCompletionConfirmation = mapProviderStatus(provider.status) === "completed" && startCount === null && remains === null && candidateStatus !== "completed";
    if (needsCompletionConfirmation && doc.get("completionReviewStatus") !== "completed") Object.assign(update, { completionReviewStatus: "completed", completionReviewFirstSeenAt: FieldValue.serverTimestamp(), completionReviewConfirmations: 1 });
    else if (needsCompletionConfirmation) update.completionReviewConfirmations = FieldValue.increment(1);
    else Object.assign(update, { completionReviewStatus: FieldValue.delete(), completionReviewFirstSeenAt: FieldValue.delete(), completionReviewConfirmations: FieldValue.delete() });
    if (progress.delivered !== null) update.deliveredQuantity = progress.delivered;
    if (progress.percent !== null) update.progressPercent = progress.percent;
    if (refundDecision === "stage") Object.assign(update, { refundReviewStatus: candidateStatus, refundReviewFirstSeenAt: FieldValue.serverTimestamp(), refundReviewConfirmations: 1, refundStatus: "pending_confirmation", refundableQuantity: candidateStatus === "partial" ? remains : quantity });
    if (refundDecision === "hold") Object.assign(update, { refundReviewConfirmations: FieldValue.increment(1), refundStatus: "pending_confirmation" });
    if (refundDecision === "confirm") Object.assign(update, { refundReviewConfirmedAt: FieldValue.serverTimestamp(), refundReviewConfirmations: FieldValue.increment(1), refundableQuantity: candidateStatus === "partial" ? remains : quantity });
    if (refundDecision === "reject") Object.assign(update, { refundReviewRejectedAt: FieldValue.serverTimestamp(), refundReviewReason: "Provider terminal response did not include valid refundable quantities", refundStatus: "evidence_rejected" });
    if (refundDecision === "none") Object.assign(update, { refundReviewStatus: FieldValue.delete(), refundReviewFirstSeenAt: FieldValue.delete(), refundReviewConfirmations: FieldValue.delete(), refundReviewReason: FieldValue.delete() });
    if (startCount !== null) update.startCount = startCount;
    if (remains !== null) update.remains = remains;

    if (status !== previous) {
      update.lastStatusChange = FieldValue.serverTimestamp();
      const transition = await recordFinanceOrderStatus({
        orderId: doc.id,
        previous,
        next: status,
        customerPriceMinor: Number(doc.get("customerPriceMinor") || 0),
        providerCostIncurredMinor: Number(doc.get("providerCostIncurredMinor") ?? doc.get("providerCostMinor") ?? 0),
        dateKey: String(doc.get("financeDateKey") || lagosDateKey(doc.get("createdAt")?.toDate?.() || new Date())),
        orderUpdate: update,
      });
      if (!transition.duplicate) {
        updated += 1;
        transitions[`${previous}->${status}`] = (transitions[`${previous}->${status}`] || 0) + 1;
        await db.collection("orderEvents").add({ orderId: doc.id, userId: doc.get("userId"), status, previousStatus: previous, createdAt: FieldValue.serverTimestamp() });
        await createCustomerNotification({ userId: doc.get("userId"), type: "order_status", title: `Order ${status.replaceAll("_", " ")}`, orderId: doc.id });
        const routineEmailCount = Number(doc.get("customerRoutineEmailCount") || 0);
        if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM && shouldSendOrderStatusEmail(status, routineEmailCount)) {
          const copy = orderStatusEmailCopy(status, doc.id.slice(0, 8));
          await sendUserEmail(String(doc.get("userId")), { ...copy, buttonLabel: "View order", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/dashboard/orders/${doc.id}` }).then(() => doc.ref.set({ ...(status === "completed" ? { customerRoutineEmailCount: FieldValue.increment(1) } : {}), lastCustomerEmailStatus: status, lastCustomerEmailAt: FieldValue.serverTimestamp() }, { merge: true })).catch((error) => console.warn("[order-email] delivery failed", { orderId: doc.id, error: error instanceof Error ? error.message : "Unknown error" }));
        }
        if (status === "completed") await recordCompletedOrderMarketing(doc.id).catch((error) => console.warn("[order-marketing-profile] completion update failed", { orderId: doc.id, error: error instanceof Error ? error.message : "Unknown error" }));
      }
    } else {
      await doc.ref.set(update, { merge: true });
    }
    processedOrderIds.push(doc.id);
    statusByOrder[doc.id] = status;

    if (["stage", "reject"].includes(refundDecision)) await db.collection("auditLogs").add({ action: refundDecision === "stage" ? "order_refund_staged" : "order_refund_evidence_rejected", targetType: "order", targetId: doc.id, providerKey, providerOrderId, candidateStatus, startCount, remains, quantity, createdAt: FieldValue.serverTimestamp() });
    if (refundDecision === "confirm") {
      const sellingRateMinor = nonNegativeInteger(doc.get("sellingRateMinor")) || 0;
      const customerPriceMinor = nonNegativeInteger(doc.get("customerPriceMinor")) || 0;
      const refundableQuantity = candidateStatus === "partial" ? remains || 0 : quantity;
      const refundDue = Number(serviceCostMinor(BigInt(sellingRateMinor), BigInt(refundableQuantity)));
      if (refundDue > 0 && customerPriceMinor > 0) {
        const refundKeys = providerConfirmationRefundKeys(doc.id);
        const refundDocuments = await db.getAll(...refundKeys.map((key) => db.collection("walletTransactions").doc(key)));
        const existingRefunds = refundDocuments.filter((item) => item.exists);
        const alreadyRefunded = existingRefunds.reduce((sum, item) => sum + Math.max(0, Number(item.get("deltaMinor") || 0)), 0);
        const amount = Math.min(
          remainingRefundAmount(refundDue, [alreadyRefunded]),
          remainingRefundAmount(customerPriceMinor, [alreadyRefunded]),
        );
        const result = amount > 0
          ? await postWallet({ userId: doc.get("userId"), type: "refund", deltaMinor: amount, currency: String(doc.get("currency") || "NGN"), idempotencyKey: `status-refund:${doc.id}`, reference: doc.id, reason: `Order ${candidateStatus} after confirmed provider status` })
          : { transactionId: existingRefunds[0]?.id || `status-refund:${doc.id}`, duplicate: true };
        const refundedAmountMinor = Math.min(customerPriceMinor, alreadyRefunded + amount);
        await doc.ref.set({ refundableQuantity, refundAmountMinor: refundDue, refundedAmountMinor, refundedAt: FieldValue.serverTimestamp(), refundSource: amount > 0 ? "system_status_reconciliation" : "existing_verified_refund", refundStatus: "posted", refundTransactionId: result.transactionId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        await Promise.all([
          db.collection("auditLogs").doc(`order-refund:${doc.id}`).set({ action: "order_refund_confirmed", targetType: "order", targetId: doc.id, providerKey, providerOrderId, candidateStatus, refundableQuantity, amountMinor: amount, refundDueMinor: refundDue, transactionId: result.transactionId, duplicate: result.duplicate, createdAt: FieldValue.serverTimestamp() }, { merge: true }),
          db.collection("orderEvents").doc(`refund:${doc.id}`).set({ orderId: doc.id, userId: doc.get("userId"), status: "refund_posted", previousStatus: candidateStatus, amountMinor: refundedAmountMinor, transactionId: result.transactionId, createdAt: FieldValue.serverTimestamp() }, { merge: true }),
        ]);
      }
    }
  }
  return { checked, attempted: eligible.length, updated, providerBatches, providerFailures, checkedByProvider, transitions, processedOrderIds, statusByOrder } satisfies OrderSynchronizationResult;
}
