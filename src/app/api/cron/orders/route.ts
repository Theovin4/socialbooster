import { timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getProvider, normalizeProviderKey } from "@/lib/providers";
import { synchronizeOrderDocuments } from "@/lib/order-sync";
import { expireAwaitingCryptoDeposits, reverifyPendingCryptoDeposits } from "@/lib/payments/crypto-reconcile";

function valid(request: Request) { const expected = process.env.CRON_SECRET || "", supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") || ""; return expected.length === supplied.length && expected.length > 0 && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)); }

export async function GET(request: Request) {
  if (!valid(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = adminDb();
  const [orderSnapshot, refillSnapshot] = await Promise.all([
    db.collection("orders").where("status", "in", ["pending", "processing", "in_progress", "cancel_requested"]).limit(100).get(),
    db.collection("refills").where("status", "in", ["pending", "processing"]).limit(100).get(),
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
    for (const doc of docs) { const result = statuses[String(doc.get("providerRefillId"))]; if (!result || result.status === doc.get("status")) continue; await doc.ref.set({ status: result.status.toLowerCase().replaceAll(" ", "_"), providerStatus: result.status, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); refillsUpdated += 1; await db.collection("notifications").add({ userId: doc.get("userId"), type: "refill_status", title: `Refill ${result.status}`, orderId: doc.get("orderId"), read: false, createdAt: FieldValue.serverTimestamp() }); }
  }
  const [crypto, expiredCrypto] = await Promise.all([reverifyPendingCryptoDeposits(), expireAwaitingCryptoDeposits()]);
  return Response.json({ ok: true, updated: orderResult.updated, checked: orderResult.checked, refillsUpdated, refillsChecked: refills.length, crypto, expiredCrypto });
}
