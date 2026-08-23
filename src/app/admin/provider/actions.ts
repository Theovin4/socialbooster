"use server";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { postWallet } from "@/lib/firebase/wallet";
import { requireAdmin } from "@/lib/firebase/session";

export async function refundOrder(formData: FormData) {
  const admin = await requireAdmin();
  const orderId = z.string().uuid().parse(formData.get("orderId"));
  const db = adminDb();
  const ref = db.collection("orders").doc(orderId);
  const order = await ref.get();
  if (!order.exists) throw new Error("Order not found");
  if (order.get("status") === "refunded") return;
  const automaticRefund = await db.collection("walletTransactions").doc(`status-refund:${orderId}`).get();
  if (automaticRefund.exists) { await ref.set({ status: "refunded", updatedAt: FieldValue.serverTimestamp() }, { merge: true }); return; }
  const amount = Number(order.get("customerPriceMinor"));
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Order charge is invalid");
  await postWallet({ userId: String(order.get("userId")), type: "refund", deltaMinor: amount, currency: String(order.get("currency") || "NGN"), idempotencyKey: `admin-order-refund:${orderId}`, reference: orderId, reason: "Administrator approved undelivered order refund", actorUid: admin.uid });
  await ref.set({ status: "refunded", refundedAt: FieldValue.serverTimestamp(), refundedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.collection("orderEvents").add({ orderId, userId: order.get("userId"), status: "refunded", createdAt: FieldValue.serverTimestamp(), actorUid: admin.uid });
  revalidatePath("/admin/provider");
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/wallet");
  revalidatePath("/dashboard/transactions");
}
