import { NextResponse } from "next/server";
import { creditVerifiedPayment } from "@/lib/payments/credit";
import { verifyFlutterwaveTransaction } from "@/lib/payments/flutterwave";
import { decimalToMinor } from "@/lib/money";
import { adminDb } from "@/lib/firebase/admin";

export async function GET(request: Request) {
  const url = new URL(request.url), id = Number(url.searchParams.get("transaction_id")), reference = url.searchParams.get("tx_ref") || "", app = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  if (!Number.isInteger(id) || !reference) return NextResponse.redirect(`${app}/dashboard/wallet?payment=cancelled`);
  try {
    const verified = await verifyFlutterwaveTransaction(id);
    if (verified.status !== "successful" || verified.tx_ref !== reference) throw new Error("Unverified payment");
    await creditVerifiedPayment({ provider: "flutterwave", reference, providerTransactionId: String(id), amountMinor: Number(decimalToMinor(String(verified.amount))), currency: verified.currency });
    return NextResponse.redirect(`${app}/dashboard/wallet?payment=success`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown callback error";
    console.error("[flutterwave:callback] credit failed", { reference, transactionId: id, error: message });
    await adminDb().collection("paymentEvents").doc(`flutterwave-callback:${id}`).set({ provider: "flutterwave", reference, providerTransactionId: String(id), status: "credit_failed", error: message.slice(0, 300), receivedAt: new Date() }, { merge: true }).catch(() => undefined);
    return NextResponse.redirect(`${app}/dashboard/wallet?payment=pending`);
  }
}
