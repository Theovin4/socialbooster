import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { postWallet } from "@/lib/firebase/wallet";
import { verifyFlutterwaveLegacyHash, verifyFlutterwaveSignature, verifyFlutterwaveTransaction } from "@/lib/payments/flutterwave";
import { decimalToMinor } from "@/lib/money";

const eventSchema = z.object({ id: z.coerce.number().int().positive().optional(), data: z.object({ id: z.coerce.number().int().positive(), tx_ref: z.string() }).optional() });
export async function POST(request: Request) {
  const raw = await request.text();
  const validSignature = verifyFlutterwaveSignature(raw, request.headers.get("flutterwave-signature"))
    || verifyFlutterwaveLegacyHash(request.headers.get("verif-hash"));
  if (!validSignature) return Response.json({ error: "Invalid signature" }, { status: 401 });
  const event = eventSchema.parse(JSON.parse(raw)), transactionId = event.data?.id ?? event.id;
  if (!transactionId) return Response.json({ received: true });
  const verified = await verifyFlutterwaveTransaction(transactionId), db = adminDb(), intentRef = db.collection("paymentIntents").doc(verified.tx_ref), intent = await intentRef.get();
  if (!intent.exists) return Response.json({ error: "Unknown payment reference" }, { status: 400 });
  const expected = intent.data()!;
  if (verified.status !== "successful" || Number(decimalToMinor(String(verified.amount))) !== expected.amountMinor || verified.currency !== expected.currency) return Response.json({ error: "Payment details do not match" }, { status: 400 });
  await postWallet({ userId: expected.userId, type: "deposit", deltaMinor: expected.amountMinor, currency: expected.currency, idempotencyKey: `flutterwave:${transactionId}`, reference: verified.tx_ref });
  await intentRef.set({ status: "paid", providerTransactionId: String(transactionId), verifiedAt: new Date() }, { merge: true });
  await db.collection("paymentEvents").doc(`flutterwave:${transactionId}`).set({provider:"flutterwave",reference:verified.tx_ref,providerTransactionId:String(transactionId),status:"processed",receivedAt:new Date()},{merge:true});
  return Response.json({ received: true });
}
