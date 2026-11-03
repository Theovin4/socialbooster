import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { creditVerifiedPayment } from "@/lib/payments/credit";
import { verifyFlutterwaveTransaction, verifyFlutterwaveWebhookAuthentication } from "@/lib/payments/flutterwave";
import { decimalToMinor } from "@/lib/money";

const eventSchema = z.object({ event: z.string().optional(), type: z.string().optional(), id: z.coerce.number().int().positive().optional(), data: z.object({ id: z.coerce.number().int().positive(), tx_ref: z.string().optional() }).optional() });

export async function POST(request: Request) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 64 * 1024) return Response.json({ error: "Payload too large" }, { status: 413 });
  if (!verifyFlutterwaveWebhookAuthentication(raw, request.headers)) return Response.json({ error: "Invalid signature" }, { status: 401 });
  let event: z.infer<typeof eventSchema>;
  try { event = eventSchema.parse(JSON.parse(raw)); } catch { return Response.json({ error: "Invalid event" }, { status: 400 }); }
  const transactionId = event.data?.id ?? event.id;
  if (!transactionId) return Response.json({ received: true });
  const eventType = String(event.event || event.type || "unknown").toLowerCase();
  if (eventType !== "charge.completed") {
    const db = adminDb(), eventRef = db.collection("paymentEvents").doc(`flutterwave-event:${transactionId}:${eventType.replace(/[^a-z0-9_-]/g, "_").slice(0, 80)}`);
    await eventRef.set({ provider: "flutterwave", reference: event.data?.tx_ref || null, providerTransactionId: String(transactionId), eventType, status: "reviewed", source: "direct_webhook", financialUpdateAllowed: false, receivedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (eventType.includes("refund") || eventType.includes("revers") || eventType.includes("chargeback")) await db.collection("fraudAlerts").doc(`flutterwave:${transactionId}:${eventType.replace(/[^a-z0-9_-]/g, "_").slice(0, 80)}`).set({ type: "payment_reversal", provider: "flutterwave", providerTransactionId: String(transactionId), reference: event.data?.tx_ref || null, status: "open", createdAt: FieldValue.serverTimestamp() }, { merge: true });
    return Response.json({ received: true });
  }

  const verified = await verifyFlutterwaveTransaction(transactionId);
  if (verified.status !== "successful") {
    const db = adminDb();
    const eventRef = db.collection("paymentEvents").doc(`flutterwave-state:${transactionId}:${verified.status.toLowerCase()}`);
    await eventRef.set({ provider: "flutterwave", reference: verified.tx_ref, providerTransactionId: String(verified.id), status: verified.status, source: "direct_webhook", financialUpdateAllowed: false, receivedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (["reversed", "refunded"].includes(verified.status.toLowerCase())) await db.collection("fraudAlerts").doc(`flutterwave:${transactionId}:${verified.status.toLowerCase()}`).set({ type: "payment_reversal", provider: "flutterwave", providerTransactionId: String(transactionId), reference: verified.tx_ref, status: "open", createdAt: FieldValue.serverTimestamp() }, { merge: true });
    return Response.json({ received: true });
  }

  await creditVerifiedPayment({ provider: "flutterwave", reference: verified.tx_ref, providerTransactionId: String(verified.id), amountMinor: Number(decimalToMinor(String(verified.amount))), currency: verified.currency, source: "direct_webhook" });
  return Response.json({ received: true });
}
