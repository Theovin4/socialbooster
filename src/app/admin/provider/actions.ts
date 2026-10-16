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
    const order = snapshot.data()!;
    const recovery = providerConfirmationRecoveryState(order);
    if (!recovery.eligible) throw new Error(recovery.reason);
    if (order.providerConfirmationDecision) {
      if (!providerConfirmationClaimMatches(order, decision, providerOrderId)) throw new Error("A different provider-confirmation decision is already in progress");
      return order;
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

export async function refreshLiveOrders() {
  await requireAdmin();
  revalidatePath("/admin/provider");
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
    if (snapshot.get("providerConfirmationResolution") === "accepted" && Number(snapshot.get("providerOrderId")) === input.providerOrderId) redirect("/admin/provider?notice=provider-confirmed");
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
  revalidatePath("/admin/provider");
  revalidatePath(`/dashboard/orders/${input.orderId}`);
  redirect("/admin/provider?notice=provider-confirmed");
}

export async function confirmProviderRejected(formData: FormData) {
  const admin = await requireAdmin();
  const input = rejectionSchema.parse(Object.fromEntries(formData));
  const db = adminDb();
  const claimed = await claimProviderConfirmation(input.orderId, "rejected", admin.uid, input.note);
  const charge = Number(claimed.customerPriceMinor);
  if (!Number.isSafeInteger(charge) || charge <= 0) throw new Error("Order charge is invalid");
  const refundKeys = providerConfirmationRefundKeys(input.orderId);
  const refundDocuments = await db.getAll(...refundKeys.map((key) => db.collection("walletTransactions").doc(key)));
  const alreadyRefunded = refundDocuments.filter((item) => item.exists).reduce((sum, item) => sum + Math.max(0, Number(item.get("deltaMinor") || 0)), 0);
  const amount = remainingRefundAmount(charge, [alreadyRefunded]);
  if (amount > 0) await postWallet({ userId: String(claimed.userId), type: "refund", deltaMinor: amount, currency: String(claimed.currency || "NGN"), idempotencyKey: `provider-confirmation-refund:${input.orderId}`, reference: input.orderId, reason: "Provider dashboard confirmed order was not accepted", actorUid: admin.uid });
  await recordFinanceOrderStatus({
    orderId: input.orderId,
    previous: "provider_confirmation_required",
    next: "failed",
    customerPriceMinor: charge,
    providerCostIncurredMinor: 0,
    dateKey: String(claimed.financeDateKey || lagosDateKey(claimed.createdAt?.toDate?.() || new Date())),
    orderUpdate: {
      status: "failed",
      providerConfirmationResolution: "rejected",
      providerConfirmationResolvedBy: admin.uid,
      providerConfirmationReviewNote: input.note,
      providerConfirmationResolvedAt: FieldValue.serverTimestamp(),
      refundedAmountMinor: Math.min(charge, alreadyRefunded + amount),
      refundedAt: FieldValue.serverTimestamp(),
      refundSource: amount > 0 ? "provider_confirmation_recovery" : "existing_verified_refund",
      updatedAt: FieldValue.serverTimestamp(),
    },
  });
  await Promise.all([
    db.collection("auditLogs").doc(`provider-confirmation:${input.orderId}`).set({ action: "provider_confirmation_rejected", targetType: "order", targetId: input.orderId, amountMinor: amount, reviewNote: input.note, actorUid: admin.uid, createdAt: FieldValue.serverTimestamp() }, { merge: true }),
    db.collection("orderEvents").doc(`provider-confirmation:${input.orderId}`).set({ orderId: input.orderId, userId: claimed.userId, status: "failed", previousStatus: "provider_confirmation_required", createdAt: FieldValue.serverTimestamp(), actorUid: admin.uid }, { merge: true }),
    createCustomerNotificationOnce({ userId: String(claimed.userId), type: "order_status", title: "Order charge returned", orderId: input.orderId }, `provider-rejected:${input.orderId}`),
  ]);
  revalidatePath("/admin/provider");
  revalidatePath(`/dashboard/orders/${input.orderId}`);
  revalidatePath("/dashboard/wallet");
  revalidatePath("/dashboard/transactions");
  redirect("/admin/provider?notice=provider-rejected");
}

export async function retryCancellation(formData: FormData) {
  const admin = await requireAdmin(), orderId = z.string().uuid().parse(formData.get("orderId")), db = adminDb(), ref = db.collection("orders").doc(orderId), order = await ref.get();
  if (!order.exists || !Number.isInteger(order.get("providerOrderId")) || order.get("cancellationStatus") !== "provider_confirmation_required") throw new Error("Cancellation is not awaiting verification");
  const [result] = await getProvider(order.get("providerKey")).client.cancel([Number(order.get("providerOrderId"))]);
  await ref.set({ cancellationStatus: result?.accepted ? "submitted" : result?.error ? "rejected" : "provider_confirmation_required", cancellationReason: result?.error || null, cancellationRetriedAt: FieldValue.serverTimestamp(), cancellationRetriedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.collection("auditLogs").add({ action: "order_cancellation_retried", targetType: "order", targetId: orderId, providerOrderId: order.get("providerOrderId"), accepted: result?.accepted || false, error: result?.error || null, actorUid: admin.uid, createdAt: FieldValue.serverTimestamp() });
  revalidatePath("/admin/provider"); revalidatePath(`/dashboard/orders/${orderId}`);
}
