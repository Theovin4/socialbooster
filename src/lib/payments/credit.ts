import { adminDb } from "@/lib/firebase/admin";
import { migrateLegacyUsdWalletToNgn, postWallet } from "@/lib/firebase/wallet";
import { decimalToMinor } from "@/lib/money";
import { verifyFlutterwaveTransaction, verifyFlutterwaveTransactionByReference } from "./flutterwave";
import { sendUserEmail } from "@/lib/email";

export async function creditVerifiedPayment(input: { provider: "flutterwave" | "paypal"; reference: string; providerTransactionId: string; amountMinor: number; currency: string }) {
  const db = adminDb(), intentRef = db.collection("paymentIntents").doc(input.reference), intent = await intentRef.get();
  if (!intent.exists) throw new Error("Unknown payment reference");
  const expected = intent.data()!;
  if (expected.provider !== input.provider || expected.amountMinor !== input.amountMinor || expected.currency !== input.currency) throw new Error("Payment details do not match");
  if (input.currency === "NGN") {
    const wallet = await db.collection("wallets").doc(String(expected.userId)).get();
    if (wallet.exists && wallet.get("currency") === "USD") await migrateLegacyUsdWalletToNgn(String(expected.userId));
  }
  const posted = await postWallet({ userId: expected.userId, type: "deposit", deltaMinor: expected.amountMinor, currency: expected.currency, idempotencyKey: `${input.provider}:${input.providerTransactionId}`, reference: input.reference });
  await intentRef.set({ status: "paid", providerTransactionId: input.providerTransactionId, verifiedAt: new Date() }, { merge: true });
  if (!posted.duplicate && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) await sendUserEmail(String(expected.userId), { subject: "Your Social Booster wallet has been funded", title: "Payment confirmed", message: `Your verified ${expected.currency} ${(Number(expected.amountMinor) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })} payment has been added to your wallet.`, buttonLabel: "View wallet", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://socialbooster-sigma.vercel.app"}/dashboard/wallet` }).catch((error) => console.warn("[payment-email] delivery failed", { reference: input.reference, error: error instanceof Error ? error.message : "Unknown error" }));
  return expected;
}

async function creditFlutterwaveVerification(verified: { id: number; status: string; amount: number; currency: string; tx_ref: string }, source: string) {
  if (verified.status !== "successful") throw new Error("Flutterwave has not marked this transaction successful");
  const expected = await creditVerifiedPayment({ provider: "flutterwave", reference: verified.tx_ref, providerTransactionId: String(verified.id), amountMinor: Number(decimalToMinor(String(verified.amount))), currency: verified.currency });
  await adminDb().collection("paymentEvents").doc(`flutterwave:${verified.id}`).set({ provider: "flutterwave", reference: verified.tx_ref, providerTransactionId: String(verified.id), status: "processed", source, receivedAt: new Date() }, { merge: true });
  return { transactionId: verified.id, reference: verified.tx_ref, userId: String(expected.userId), amountMinor: Number(expected.amountMinor), currency: String(expected.currency) };
}

export async function reconcileFlutterwaveTransaction(transactionId: number, source = "manual") {
  return creditFlutterwaveVerification(await verifyFlutterwaveTransaction(transactionId), source);
}

export async function reconcilePendingFlutterwavePayments(userId: string) {
  const snapshot = await adminDb().collection("paymentIntents").where("userId", "==", userId).limit(25).get();
  const pending = snapshot.docs.filter((doc) => doc.get("provider") === "flutterwave" && doc.get("status") === "pending");
  let credited = 0;
  for (const intent of pending) {
    try {
      const verified = await verifyFlutterwaveTransactionByReference(intent.id);
      if (verified.tx_ref !== intent.id || verified.status !== "successful") continue;
      await creditFlutterwaveVerification(verified, "customer_return_recovery");
      credited += 1;
    } catch (error) {
      console.warn("[flutterwave:recovery] pending intent not reconciled", { reference: intent.id, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
  return credited;
}
