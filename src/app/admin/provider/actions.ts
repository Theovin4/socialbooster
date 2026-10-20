"use server";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { postWallet } from "@/lib/firebase/wallet";
import { requireAdmin } from "@/lib/firebase/session";
import { getProvider, normalizeProviderKey } from "@/lib/providers";
import { remainingRefundAmount } from "@/lib/order-refund-policy";
import { recordFinanceOrderStatus, recordFinanceProviderAccepted } from "@/lib/firebase/analytics-rollups";
import { lagosDateKey } from "@/lib/firebase/stats";
import { createCustomerNotificationOnce } from "@/lib/customer-notifications";
import { classifySubmissionError, safeSubmissionDiagnostics } from "@/lib/order-submission-outcome";
import { providerAcceptsNewOrders, recordAmbiguousProviderSubmission } from "@/lib/provider-order-health";
import { sendAdminAlert } from "@/lib/email";
import { synchronizeOrderDocuments, type PrefetchedProviderStatuses } from "@/lib/order-sync";
import {
  providerConfirmationClaimMatches,
  providerConfirmationRecoveryState,
  providerConfirmationRefundKeys,
  type ProviderConfirmationDecision,
} from "@/lib/provider-confirmation-recovery";

const acceptanceSchema = z.object({
  orderId: z.string().uuid(),
  providerOrderId: z.coerce.number().int().positive(),
  note: z.string().trim().min(10).max(500),
  confirmed: z.literal("yes"),
});
const rejectionSchema = z.object({
  orderId: z.string().uuid(),
  note: z.string().trim().min(10).max(500),
  confirmed: z.literal("yes"),
});
const retrySchema = rejectionSchema;
const healthSchema = z.object({ providerKey: z.enum(["followspanel", "nitro", "smmworld"]), confirmed: z.literal("yes") });

async function claimProviderConfirmation(
  orderId: string,
  decision: ProviderConfirmationDecision,
  actorUid: string,
  note: string,
  providerOrderId?: number,
) {
  const db = adminDb(), ref = db.collection("orders").doc(orderId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("Order not found");
    const order = snapshot.data()! as Record<string, unknown>;
    const recovery = providerConfirmationRecoveryState(order);
    if (!recovery.eligible) throw new Error(recovery.reason);
    if (order.providerConfirmationDecision) {
      const claimedAt = (order.providerConfirmationClaimedAt as { toMillis?: () => number } | undefined)?.toMillis?.() || Date.now();
      const staleRetryClaim = order.providerConfirmationDecision === "retry" && decision !== "retry" && Date.now() - claimedAt >= 10 * 60 * 1000;
      if (!staleRetryClaim) {
        if (!providerConfirmationClaimMatches(order, decision, providerOrderId)) throw new Error("A different provider-confirmation decision is already in progress");
        return order;
      }
    }
    transaction.set(ref, {
      providerConfirmationDecision: decision,
      providerConfirmationExternalId: decision === "accepted" ? providerOrderId : null,
      providerConfirmationReviewNote: note,
      providerConfirmationClaimedBy: actorUid,
      providerConfirmationClaimedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ...order, providerConfirmationDecision: decision, providerConfirmationExternalId: providerOrderId };
  });
}

async function claimSingleRetry(orderId: string, actorUid: string, note: string): Promise<Record<string, unknown>> {
  const db = adminDb(), ref = db.collection("orders").doc(orderId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("Order not found");
    const order = snapshot.data()! as Record<string, unknown>;
    const recovery = providerConfirmationRecoveryState(order);
    if (!recovery.eligible) throw new Error(recovery.reason);
    if (order.providerConfirmationRetryUsed) throw new Error("The one permitted provider retry has already been used");
    if (order.providerConfirmationDecision) throw new Error("Another provider-confirmation decision is already in progress");
    const attempt = Math.max(1, Number(order.submissionAttemptCount || 1)) + 1;
    transaction.set(ref, {
      providerConfirmationDecision: "retry",
      providerConfirmationRetryUsed: true,
      providerConfirmationReviewNote: note,
      providerConfirmationClaimedBy: actorUid,
      providerConfirmationClaimedAt: FieldValue.serverTimestamp(),
      submissionAttemptCount: attempt,
      submissionLastAttemptAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ...order, providerConfirmationDecision: "retry", providerConfirmationRetryUsed: true, submissionAttemptCount: attempt } as Record<string, unknown>;
  });
}

async function refundAndCloseProviderConfirmation(input: { orderId: string; order: Record<string, unknown>; actorUid: string; note: string; source: string }) {
  const db = adminDb(), charge = Number(input.order.customerPriceMinor);
  if (!Number.isSafeInteger(charge) || charge <= 0) throw new Error("Order charge is invalid");
  const refundKeys = providerConfirmationRefundKeys(input.orderId);
  const refundDocuments = await db.getAll(...refundKeys.map((key) => db.collection("walletTransactions").doc(key)));
  const alreadyRefunded = refundDocuments.filter((item) => item.exists).reduce((sum, item) => sum + Math.max(0, Number(item.get("deltaMinor") || 0)), 0);
  const amount = remainingRefundAmount(charge, [alreadyRefunded]);
  if (amount > 0) await postWallet({ userId: String(input.order.userId), type: "refund", deltaMinor: amount, currency: String(input.order.currency || "NGN"), idempotencyKey: `provider-confirmation-refund:${input.orderId}`, reference: input.orderId, reason: "Provider confirmation recovery closed without an accepted order", actorUid: input.actorUid });
  await recordFinanceOrderStatus({
    orderId: input.orderId,
    previous: "provider_confirmation_required",
    next: "failed",
    customerPriceMinor: charge,
    providerCostIncurredMinor: 0,
    dateKey: String(input.order.financeDateKey || lagosDateKey((input.order.createdAt as { toDate?: () => Date } | undefined)?.toDate?.() || new Date())),
    orderUpdate: {
      status: "failed",
      submissionOutcome: "CONFIRMED_REJECTED",
      providerConfirmationResolution: "rejected",
      providerConfirmationResolvedBy: input.actorUid,
      providerConfirmationReviewNote: input.note,
      providerConfirmationResolvedAt: FieldValue.serverTimestamp(),
      refundedAmountMinor: Math.min(charge, alreadyRefunded + amount),
      refundedAt: FieldValue.serverTimestamp(),
      refundSource: amount > 0 ? input.source : "existing_verified_refund",
      updatedAt: FieldValue.serverTimestamp(),
    },
  });
  await Promise.all([
    db.collection("auditLogs").doc(`provider-confirmation:${input.orderId}`).set({ action: "provider_confirmation_refund_and_close", targetType: "order", targetId: input.orderId, amountMinor: amount, reviewNote: input.note, source: input.source, actorUid: input.actorUid, createdAt: FieldValue.serverTimestamp() }, { merge: true }),
    db.collection("orderEvents").doc(`provider-confirmation:${input.orderId}`).set({ orderId: input.orderId, userId: input.order.userId, status: "failed", previousStatus: "provider_confirmation_required", createdAt: FieldValue.serverTimestamp(), actorUid: input.actorUid }, { merge: true }),
    createCustomerNotificationOnce({ userId: String(input.order.userId), type: "order_status", title: "Order charge returned", orderId: input.orderId }, `provider-rejected:${input.orderId}`),
  ]);
  return amount;
}

export async function refreshLiveOrders() {
  await requireAdmin();
  const snapshot = await adminDb().collection("orders")
    .where("status", "in", ["pending", "processing", "in_progress", "cancel_requested"])
    .limit(100)
    .get();
  await synchronizeOrderDocuments(
    snapshot.docs.filter((doc) => Number.isInteger(doc.get("providerOrderId"))),
    true,
  );
  revalidatePath("/admin/provider");
  revalidatePath("/dashboard/orders");
}

export async function refundOrder(formData: FormData) {
  const admin = await requireAdmin();
  const orderId = z.string().uuid().parse(formData.get("orderId"));
  const db = adminDb();
  const ref = db.collection("orders").doc(orderId);
  const order = await ref.get();
  if (!order.exists) throw new Error("Order not found");
  if (order.get("status") === "provider_confirmation_required") throw new Error("Resolve provider confirmation before issuing a refund");
  const charge = Number(order.get("customerPriceMinor"));
  if (!Number.isSafeInteger(charge) || charge <= 0) throw new Error("Order charge is invalid");
  if (order.get("status") === "refunded" && Number(order.get("refundedAmountMinor") || 0) >= charge) return;
  const [automaticRefund, manualRefund] = await db.getAll(db.collection("walletTransactions").doc(`status-refund:${orderId}`), db.collection("walletTransactions").doc(`admin-order-refund:${orderId}`));
  const alreadyRefunded = [automaticRefund, manualRefund].filter((item) => item.exists).reduce((sum, item) => sum + Math.max(0, Number(item.get("deltaMinor") || 0)), 0);
  const amount = remainingRefundAmount(charge, [alreadyRefunded]);
  if (amount > 0) await postWallet({ userId: String(order.get("userId")), type: "refund", deltaMinor: amount, currency: String(order.get("currency") || "NGN"), idempotencyKey: `admin-order-refund:${orderId}`, reference: orderId, reason: "Administrator approved remaining undelivered order refund", actorUid: admin.uid });
  const previous = String(order.get("status") || "pending");
  const orderUpdate = { status: "refunded", refundedAmountMinor: Math.min(charge, alreadyRefunded + amount), refundedAt: FieldValue.serverTimestamp(), refundedBy: admin.uid, refundSource: amount > 0 ? "administrator" : "existing_verified_refund", updatedAt: FieldValue.serverTimestamp() };
  if (previous === "refunded") await ref.set(orderUpdate, { merge: true });
  else await recordFinanceOrderStatus({
    orderId,
    previous,
    next: "refunded",
    customerPriceMinor: charge,
    providerCostIncurredMinor: Number.isInteger(order.get("providerOrderId")) ? Number(order.get("providerCostIncurredMinor") ?? order.get("providerCostMinor") ?? 0) : 0,
    dateKey: String(order.get("financeDateKey") || lagosDateKey(order.get("createdAt")?.toDate?.() || new Date())),
    orderUpdate,
  });
  await db.collection("orderEvents").add({ orderId, userId: order.get("userId"), status: "refunded", createdAt: FieldValue.serverTimestamp(), actorUid: admin.uid });
  revalidatePath("/admin/provider");
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/wallet");
  revalidatePath("/dashboard/transactions");
}

export async function confirmProviderAccepted(formData: FormData) {
  const admin = await requireAdmin();
  const input = acceptanceSchema.parse(Object.fromEntries(formData));
  const db = adminDb(), ref = db.collection("orders").doc(input.orderId), snapshot = await ref.get();
  if (!snapshot.exists) throw new Error("Order not found");
  const recovery = providerConfirmationRecoveryState(snapshot.data()!);
  if (!recovery.eligible) {
    if (snapshot.get("providerConfirmationResolution") === "accepted" && Number(snapshot.get("providerOrderId")) === input.providerOrderId) {
      await synchronizeOrderDocuments([snapshot], true);
      redirect("/admin/provider?notice=provider-confirmed");
    }
    throw new Error(recovery.reason);
  }
  const provider = getProvider(snapshot.get("providerKey"));
  if (!provider.configured) throw new Error("Provider is not configured for read-only verification");
  const duplicate = await db.collection("orders").where("providerOrderId", "==", input.providerOrderId).limit(10).get();
  if (duplicate.docs.some((item) => item.id !== input.orderId && normalizeProviderKey(item.get("providerKey")) === provider.key)) {
    throw new Error("Provider order ID is already assigned to another order");
  }
  // This is a read-only provider status lookup. Recovery never calls add().
  const live = await provider.client.status(input.providerOrderId);
  await claimProviderConfirmation(input.orderId, "accepted", admin.uid, input.note, input.providerOrderId);
  await recordFinanceProviderAccepted({
    orderId: input.orderId,
    providerOrderId: input.providerOrderId,
    confirmationRecovery: { resolvedBy: admin.uid, note: input.note, providerStatus: live.status },
  });
  await Promise.all([
    db.collection("auditLogs").doc(`provider-confirmation:${input.orderId}`).set({ action: "provider_confirmation_accepted", targetType: "order", targetId: input.orderId, providerKey: provider.key, providerOrderId: input.providerOrderId, providerStatus: live.status, reviewNote: input.note, actorUid: admin.uid, createdAt: FieldValue.serverTimestamp() }, { merge: true }),
    db.collection("orderEvents").doc(`provider-confirmation:${input.orderId}`).set({ orderId: input.orderId, userId: snapshot.get("userId"), status: "pending", previousStatus: "provider_confirmation_required", createdAt: FieldValue.serverTimestamp(), actorUid: admin.uid }, { merge: true }),
    createCustomerNotificationOnce({ userId: String(snapshot.get("userId")), type: "order_status", title: "Order confirmation completed", orderId: input.orderId }, `provider-confirmed:${input.orderId}`),
  ]);
  const accepted = await ref.get();
  const prefetched: PrefetchedProviderStatuses = new Map([[provider.key, { [String(input.providerOrderId)]: live }]]);
  await synchronizeOrderDocuments([accepted], true, prefetched);
  revalidatePath("/admin/provider");
  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${input.orderId}`);
  redirect("/admin/provider?notice=provider-confirmed");
}

export async function confirmProviderRejected(formData: FormData) {
  const admin = await requireAdmin();
  const input = rejectionSchema.parse(Object.fromEntries(formData));
  const existing = await adminDb().collection("orders").doc(input.orderId).get();
  if (existing.exists && existing.get("providerConfirmationResolution") === "rejected" && Number(existing.get("refundedAmountMinor") || 0) >= Number(existing.get("customerPriceMinor") || 0)) redirect("/admin/provider?notice=provider-rejected");
  const claimed = await claimProviderConfirmation(input.orderId, "rejected", admin.uid, input.note);
  await refundAndCloseProviderConfirmation({ orderId: input.orderId, order: claimed, actorUid: admin.uid, note: input.note, source: "provider_confirmation_recovery" });
  revalidatePath("/admin/provider");
  revalidatePath(`/dashboard/orders/${input.orderId}`);
  revalidatePath("/dashboard/wallet");
  revalidatePath("/dashboard/transactions");
  redirect("/admin/provider?notice=provider-rejected");
}

export async function retryProviderSubmissionOnce(formData: FormData) {
  const admin = await requireAdmin();
  const input = retrySchema.parse(Object.fromEntries(formData));
  const db = adminDb(), ref = db.collection("orders").doc(input.orderId);
  const beforeClaim = await ref.get();
  if (!beforeClaim.exists) throw new Error("Order not found");
  const provider = getProvider(beforeClaim.get("providerKey"));
  if (!provider.configured) throw new Error("Provider is not configured for a confirmed retry");
  const health = await db.collection("providerOrderHealth").doc(provider.key).get();
  if (!providerAcceptsNewOrders(health.exists ? health.data() : undefined)) throw new Error("Provider is degraded; complete a successful health verification before retrying");
  const order = await claimSingleRetry(input.orderId, admin.uid, input.note);
  let providerOrderId: number;
  try {
    // Exactly one administrator-authorized add call. Provider clients retain safeRetry=false.
    const result = await provider.client.add(order.providerServiceId as string | number, String(order.link), Number(order.quantity));
    providerOrderId = result.order;
  } catch (error) {
    const outcome = classifySubmissionError(error), diagnostics = safeSubmissionDiagnostics(error);
    if (outcome === "CONFIRMED_REJECTED") {
      await refundAndCloseProviderConfirmation({ orderId: input.orderId, order, actorUid: admin.uid, note: input.note, source: "provider_retry_explicit_rejection" });
      revalidatePath("/admin/provider");
      redirect("/admin/provider?notice=provider-rejected");
    }
    await ref.set({
      status: "provider_confirmation_required",
      submissionOutcome: "AMBIGUOUS",
      ...diagnostics,
      providerConfirmationDecision: FieldValue.delete(),
      providerConfirmationClaimedBy: FieldValue.delete(),
      providerConfirmationClaimedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await recordAmbiguousProviderSubmission({ providerKey: provider.key, orderId: input.orderId, attempt: Number(order.submissionAttemptCount) }).catch((healthError) => console.warn("[provider-health] ambiguity recording failed", { orderId: input.orderId, error: healthError instanceof Error ? healthError.message : "Unknown error" }));
    await sendAdminAlert({ subject: `Retry still requires review #${input.orderId.slice(0, 8)}`, title: "Provider confirmation remains unresolved", message: "The single administrator-authorized retry did not return a certain result. No further automatic or manual retry is permitted; attach a verified provider order or refund and close.", buttonLabel: "Open recovery queue", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/admin/provider`, idempotencyKey: `provider-retry-ambiguous-${input.orderId}` }).catch(() => undefined);
    revalidatePath("/admin/provider");
    redirect("/admin/provider?notice=provider-review");
  }
  await recordFinanceProviderAccepted({ orderId: input.orderId, providerOrderId, confirmationRecovery: { resolvedBy: admin.uid, note: input.note, providerStatus: "manual_retry_accepted" } });
  await Promise.all([
    db.collection("auditLogs").doc(`provider-confirmation-retry:${input.orderId}`).set({ action: "provider_confirmation_manual_retry_accepted", targetType: "order", targetId: input.orderId, providerKey: provider.key, providerOrderId, actorUid: admin.uid, createdAt: FieldValue.serverTimestamp() }, { merge: true }),
    db.collection("orderEvents").doc(`provider-confirmation-retry:${input.orderId}`).set({ orderId: input.orderId, userId: order.userId, status: "pending", previousStatus: "provider_confirmation_required", createdAt: FieldValue.serverTimestamp(), actorUid: admin.uid }, { merge: true }),
    createCustomerNotificationOnce({ userId: String(order.userId), type: "order_status", title: "Order confirmation completed", orderId: input.orderId }, `provider-retry-confirmed:${input.orderId}`),
  ]);
  await synchronizeOrderDocuments([await ref.get()], true);
  revalidatePath("/admin/provider");
  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${input.orderId}`);
  redirect("/admin/provider?notice=provider-confirmed");
}

export async function verifyProviderOrderHealth(formData: FormData) {
  const admin = await requireAdmin();
  const input = healthSchema.parse(Object.fromEntries(formData));
  const provider = getProvider(input.providerKey);
  if (!provider.configured) throw new Error("Provider is not configured");
  await provider.client.balance();
  const db = adminDb();
  await Promise.all([
    db.collection("providerOrderHealth").doc(provider.key).set({ status: "ACTIVE", ambiguousCount: 0, windowStartedAt: FieldValue.serverTimestamp(), verifiedAt: FieldValue.serverTimestamp(), verifiedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    db.collection("operationsAlerts").doc(`provider_orders_${provider.key}`).set({ active: false, resolvedAt: FieldValue.serverTimestamp(), resolvedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    db.collection("auditLogs").add({ action: "provider_order_health_verified", targetType: "provider", targetId: provider.key, actorUid: admin.uid, createdAt: FieldValue.serverTimestamp() }),
  ]);
  revalidatePath("/admin/provider");
  redirect("/admin/provider?notice=provider-health-verified");
}

export async function retryCancellation(formData: FormData) {
  const admin = await requireAdmin(), orderId = z.string().uuid().parse(formData.get("orderId")), db = adminDb(), ref = db.collection("orders").doc(orderId), order = await ref.get();
  if (!order.exists || !Number.isInteger(order.get("providerOrderId")) || order.get("cancellationStatus") !== "provider_confirmation_required") throw new Error("Cancellation is not awaiting verification");
  const [result] = await getProvider(order.get("providerKey")).client.cancel([Number(order.get("providerOrderId"))]);
  await ref.set({ cancellationStatus: result?.accepted ? "submitted" : result?.error ? "rejected" : "provider_confirmation_required", cancellationReason: result?.error || null, cancellationRetriedAt: FieldValue.serverTimestamp(), cancellationRetriedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.collection("auditLogs").add({ action: "order_cancellation_retried", targetType: "order", targetId: orderId, providerOrderId: order.get("providerOrderId"), accepted: result?.accepted || false, error: result?.error || null, actorUid: admin.uid, createdAt: FieldValue.serverTimestamp() });
  revalidatePath("/admin/provider"); revalidatePath(`/dashboard/orders/${orderId}`);
}
