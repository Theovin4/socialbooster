import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { postWallet } from "@/lib/firebase/wallet";
import { verifyPayPalWebhook } from "@/lib/payments/paypal";
import { decimalToMinor } from "@/lib/money";

const eventSchema = z.object({ id: z.string(), event_type: z.string(), resource: z.object({ id: z.string(), status: z.string().optional(), amount: z.object({ value: z.string(), currency_code: z.string() }).optional(), supplementary_data: z.object({ related_ids: z.object({ order_id: z.string().optional() }) }).optional(), custom_id: z.string().optional() }).passthrough() });
export async function POST(request: Request) {
  const event = eventSchema.parse(await request.json());
  if (!(await verifyPayPalWebhook(request.headers, event))) return Response.json({ error: "Invalid signature" }, { status: 401 });
  const db = adminDb();
  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") { await db.collection("paymentEvents").doc(`paypal:${event.id}`).set({ provider:"paypal",eventType:event.event_type,status:"reviewed",receivedAt:new Date() },{merge:true}); if(event.event_type.includes("REFUND")||event.event_type.includes("REVERSED"))await db.collection("fraudAlerts").doc(`paypal:${event.id}`).set({type:"payment_reversal",provider:"paypal",providerTransactionId:event.resource.id,status:"open",createdAt:new Date()},{merge:true}); return Response.json({ received: true }); }
  const reference = event.resource.custom_id || event.resource.supplementary_data?.related_ids.order_id;
  if (!reference || !event.resource.amount) return Response.json({ error: "Missing payment reference" }, { status: 400 });
  const intentRef = db.collection("paymentIntents").doc(reference), intent = await intentRef.get();
  if (!intent.exists) return Response.json({ error: "Unknown payment reference" }, { status: 400 });
  const expected = intent.data()!, amountMinor = Number(decimalToMinor(event.resource.amount.value));
  if (amountMinor !== expected.amountMinor || event.resource.amount.currency_code !== expected.currency) return Response.json({ error: "Payment details do not match" }, { status: 400 });
  await postWallet({ userId: expected.userId, type: "deposit", deltaMinor: expected.amountMinor, currency: expected.currency, idempotencyKey: `paypal:${event.resource.id}`, reference });
  await intentRef.set({ status: "paid", providerTransactionId: event.resource.id, verifiedAt: new Date() }, { merge: true });
  await db.collection("paymentEvents").doc(`paypal:${event.id}`).set({provider:"paypal",eventType:event.event_type,reference,providerTransactionId:event.resource.id,status:"processed",receivedAt:new Date()},{merge:true});
  return Response.json({ received: true });
}
