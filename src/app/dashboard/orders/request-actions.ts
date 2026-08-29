"use server";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { FollowsPanelClient } from "@/lib/providers/followspanel";
import { sendAdminAlert } from "@/lib/email";

async function ownedOrder(id: string, userId: string) {
  const ref = adminDb().collection("orders").doc(id), snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get("userId") !== userId) throw new Error("Order not found");
  return { ref, data: snapshot.data()! };
}

export async function requestRefill(formData: FormData) {
  const user = await requireUser(), id = String(formData.get("id") || ""), { data } = await ownedOrder(id, user.uid);
  if (!data.refillSupported || !data.providerOrderId || data.status !== "completed") throw new Error("Refill is not available");
  const db = adminDb(), refillRef = db.collection("refills").doc(id), existing = await refillRef.get();
  if (existing.exists) return;
  await refillRef.create({ orderId: id, userId: user.uid, status: "submitting", createdAt: FieldValue.serverTimestamp() });
  try { const result = await new FollowsPanelClient().refill(data.providerOrderId); await refillRef.set({ providerRefillId: result.refill, status: "pending", updatedAt: FieldValue.serverTimestamp() }, { merge: true }); }
  catch { await refillRef.set({ status: "provider_confirmation_required", updatedAt: FieldValue.serverTimestamp() }, { merge: true }); }
  revalidatePath(`/dashboard/orders/${id}`); revalidatePath("/dashboard/refills");
}

export async function requestCancellation(formData: FormData) {
  const user = await requireUser(), id = String(formData.get("id") || ""), { ref, data } = await ownedOrder(id, user.uid);
  if (!data.cancelSupported || !data.providerOrderId || !["pending", "processing", "in_progress"].includes(data.status)) redirect(`/dashboard/orders/${id}?notice=cancellation-unavailable`);
  if (data.cancellationRequestedAt) redirect(`/dashboard/orders/${id}?notice=cancellation-pending`);
  const db = adminDb(), previousStatus = String(data.status);
  await ref.set({ cancellationRequestedAt: FieldValue.serverTimestamp(), cancellationStatus: "submitting", statusBeforeCancellation: previousStatus, status: "cancel_requested", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  let notice = "cancellation-pending";
  try {
    const [result] = await new FollowsPanelClient().cancel([Number(data.providerOrderId)]);
    if (result?.accepted) {
      await ref.set({ cancellationStatus: "submitted", cancellationProviderResponse: { accepted: true, order: result.order }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await db.collection("orderEvents").add({ orderId: id, userId: user.uid, status: "cancel_requested", previousStatus, providerOrderId: data.providerOrderId, createdAt: FieldValue.serverTimestamp() });
      await db.collection("notifications").add({ userId: user.uid, type: "cancellation", title: "Cancellation request submitted", orderId: id, read: false, createdAt: FieldValue.serverTimestamp() });
    } else if (result?.error) {
      await ref.set({ status: previousStatus, cancellationStatus: "rejected", cancellationReason: result.error, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      notice = "cancellation-rejected";
    } else {
      await ref.set({ cancellationStatus: "provider_confirmation_required", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      notice = "cancellation-review";
    }
  } catch (error) {
    await ref.set({ cancellationStatus: "provider_confirmation_required", cancellationReason: error instanceof Error ? error.message : "Provider confirmation unavailable", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    notice = "cancellation-review";
  }
  await db.collection("auditLogs").add({
    actorId: user.uid,
    action: "customer_order_cancellation_requested",
    targetId: id,
    providerOrderId: data.providerOrderId,
    outcome: notice,
    createdAt: FieldValue.serverTimestamp(),
  });
  await sendAdminAlert({ subject: `Cancellation request #${id.slice(0, 8)}`, title: "Customer cancellation request", message: `A customer requested cancellation for Social Booster order #${id.slice(0, 8)} / Followpanel order ${data.providerOrderId}. Current state: ${notice.replaceAll("-", " ")}.`, buttonLabel: "Review live order", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/admin/provider` }).catch((error) => console.warn("[cancellation-alert] delivery failed", { orderId: id, error: error instanceof Error ? error.message : "Unknown error" }));
  revalidatePath(`/dashboard/orders/${id}`); revalidatePath("/admin/provider");
  redirect(`/dashboard/orders/${id}?notice=${notice}`);
}
