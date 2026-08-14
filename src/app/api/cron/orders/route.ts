import { timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { postWallet } from "@/lib/firebase/wallet";
import { serviceCostMinor } from "@/lib/money";
import { FollowsPanelClient } from "@/lib/providers/followspanel";
import { mapProviderStatus } from "@/lib/order-status";

function valid(request: Request) { const expected = process.env.CRON_SECRET || "", supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") || ""; return expected.length === supplied.length && expected.length > 0 && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)); }

export async function GET(request: Request) {
  if (!valid(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = adminDb(), client = new FollowsPanelClient();
  const [orderSnapshot, refillSnapshot] = await Promise.all([
    db.collection("orders").where("status", "in", ["pending", "processing", "in_progress", "partial", "cancel_requested"]).limit(100).get(),
    db.collection("refills").where("status", "in", ["pending", "processing"]).limit(100).get(),
  ]);
  const orders = orderSnapshot.docs.filter((doc) => Number.isInteger(doc.get("providerOrderId")));
  let updated = 0, refillsUpdated = 0;

  if (orders.length) {
    const statuses = await client.statuses(orders.map((doc) => doc.get("providerOrderId")));
    for (const doc of orders) {
      const provider = statuses[String(doc.get("providerOrderId"))]; if (!provider) continue;
      const status = mapProviderStatus(provider.status), previous = doc.get("status");
      await doc.ref.set({ status, providerStatus: provider.status, providerCharge: provider.charge || null, startCount: provider.start_count || null, remains: provider.remains || null, lastProviderUpdate: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (status !== previous) { updated += 1; await db.collection("orderEvents").add({ orderId: doc.id, userId: doc.get("userId"), status, previousStatus: previous, createdAt: FieldValue.serverTimestamp() }); await db.collection("notifications").add({ userId: doc.get("userId"), type: "order_status", title: `Order ${status.replaceAll("_", " ")}`, orderId: doc.id, read: false, createdAt: FieldValue.serverTimestamp() }); }
      if (["failed", "cancelled", "partial"].includes(status)) { const remains = status === "partial" ? BigInt(provider.remains || "0") : BigInt(doc.get("quantity")), refund = Number(serviceCostMinor(BigInt(doc.get("sellingRateMinor")), remains)); if (refund > 0) await postWallet({ userId: doc.get("userId"), type: "refund", deltaMinor: Math.min(refund, doc.get("customerPriceMinor")), currency: doc.get("currency"), idempotencyKey: `status-refund:${doc.id}`, reference: doc.id, reason: `Order ${status}` }); }
    }
  }

  const refills = refillSnapshot.docs.filter((doc) => Number.isInteger(doc.get("providerRefillId")));
  if (refills.length) {
    const statuses = await client.refillStatuses(refills.map((doc) => doc.get("providerRefillId")));
    for (const doc of refills) { const result = statuses[String(doc.get("providerRefillId"))]; if (!result || result.status === doc.get("status")) continue; await doc.ref.set({ status: result.status.toLowerCase().replaceAll(" ", "_"), providerStatus: result.status, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); refillsUpdated += 1; await db.collection("notifications").add({ userId: doc.get("userId"), type: "refill_status", title: `Refill ${result.status}`, orderId: doc.get("orderId"), read: false, createdAt: FieldValue.serverTimestamp() }); }
  }
  return Response.json({ ok: true, updated, checked: orders.length, refillsUpdated, refillsChecked: refills.length });
}
