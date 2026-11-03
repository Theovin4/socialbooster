import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { creditVerifiedPayment } from "@/lib/payments/credit";
import { flutterwaveGatewayMode, verifySocialBoosterGatewayDelivery } from "@/lib/payments/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (flutterwaveGatewayMode() === "off") return Response.json({ error: "gateway_disabled" }, { status: 503 });
  const rawBody = await request.text();
  const verified = verifySocialBoosterGatewayDelivery({ rawBody, headers: request.headers, secret: process.env.FLUTTERWAVE_GATEWAY_DELIVERY_SECRET });
  if (!verified.ok) return Response.json({ error: "gateway_delivery_rejected" }, { status: verified.reason === "secret_invalid" ? 503 : 401 });

  const envelope = verified.envelope;
  if (envelope.ownership.source !== "intent" || !envelope.ownership.txRef || envelope.ownership.txRef !== envelope.internalEntityId) return Response.json({ error: "gateway_ownership_mismatch" }, { status: 409 });
  const db = adminDb();
  const intentRef = db.collection("paymentIntents").doc(envelope.internalEntityId);
  const intent = await intentRef.get();
  if (!intent.exists || envelope.ownership.txRef !== intent.id || intent.get("provider") !== "flutterwave") return Response.json({ error: "gateway_ownership_mismatch" }, { status: 409 });

  if (envelope.verification.financialUpdateAllowed) {
    if (envelope.verification.kind !== "provider_transaction"
      || !["successful", "succeeded"].includes(envelope.verification.status.toLowerCase())
      || envelope.verification.amountMinor !== String(intent.get("amountMinor"))
      || envelope.verification.currency !== intent.get("currency")) return Response.json({ error: "gateway_payment_mismatch" }, { status: 409 });
    const posted = await creditVerifiedPayment({
      provider: "flutterwave",
      reference: intent.id,
      providerTransactionId: envelope.verification.providerTransactionId,
      amountMinor: Number(intent.get("amountMinor")),
      currency: String(intent.get("currency")),
      source: "shared_gateway",
      gatewayDeliveryId: envelope.deliveryId,
      gatewayEventId: envelope.eventId,
    });
    return Response.json({ received: true, duplicate: posted.duplicate });
  }

  const duplicate = await db.runTransaction(async (transaction) => {
    const deliveryRef = db.collection("gatewayDeliveryReceipts").doc(envelope.deliveryId);
    const eventReceiptRef = db.collection("gatewayEventReceipts").doc(envelope.eventId);
    const paymentEventRef = db.collection("paymentEvents").doc(`gateway:${envelope.eventId}`);
    const [delivery, eventReceipt] = await Promise.all([transaction.get(deliveryRef), transaction.get(eventReceiptRef)]);
    const receipt = { applicationId: "social_booster", eventId: envelope.eventId, providerTransactionKey: envelope.verification.kind === "provider_transaction" ? `flutterwave:${envelope.verification.providerTransactionId}` : null, reference: intent.id, status: "state_only", receivedAt: FieldValue.serverTimestamp() };
    if (delivery.exists || eventReceipt.exists) {
      const existing = (delivery.exists ? delivery : eventReceipt).data()!;
      if (existing.applicationId !== receipt.applicationId || existing.eventId !== receipt.eventId || existing.reference !== receipt.reference) throw new Error("Gateway receipt conflict");
      return true;
    }
    transaction.create(deliveryRef, receipt);
    transaction.create(eventReceiptRef, receipt);
    transaction.create(paymentEventRef, { provider: "flutterwave", reference: intent.id, providerTransactionId: envelope.verification.kind === "provider_transaction" ? envelope.verification.providerTransactionId : null, status: envelope.verification.status || envelope.eventType, source: "shared_gateway", financialUpdateAllowed: false, receivedAt: FieldValue.serverTimestamp() });
    const status = String(envelope.verification.status || envelope.eventType).toLowerCase();
    if (status.includes("refund") || status.includes("revers") || status.includes("chargeback")) transaction.set(db.collection("fraudAlerts").doc(`gateway:${envelope.eventId}`), { type: "payment_reversal", provider: "flutterwave", providerTransactionId: envelope.verification.kind === "provider_transaction" ? envelope.verification.providerTransactionId : null, reference: intent.id, status: "open", source: "shared_gateway", createdAt: FieldValue.serverTimestamp() }, { merge: true });
    return false;
  });
  return Response.json({ received: true, duplicate });
}
