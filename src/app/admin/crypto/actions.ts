"use server";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/firebase/session";
import { adminDb } from "@/lib/firebase/admin";
import { postWallet } from "@/lib/firebase/wallet";
import { cryptoCreditMinor, verifyCryptoPayment, type CryptoNetwork } from "@/lib/payments/crypto";
import { reverifyCryptoDeposit } from "@/lib/payments/crypto-reconcile";
import { sendUserEmail } from "@/lib/email";

const decisionSchema = z.object({ id: z.string().min(10), decision: z.enum(["approve", "reject", "cancel", "recheck"]), reason: z.string().trim().max(300).optional() });

export async function decideCryptoDeposit(formData: FormData) {
  let outcome = "updated";
  try {
    const admin = await requireAdmin(), input = decisionSchema.parse(Object.fromEntries(formData)), db = adminDb(), ref = db.collection("cryptoDeposits").doc(input.id), snapshot = await ref.get();
    if (!snapshot.exists) throw new Error("Crypto deposit not found");
    const status = String(snapshot.get("status"));
    if (["approved", "rejected", "cancelled"].includes(status)) outcome = "already-final";
    else if (input.decision === "recheck") {
      await reverifyCryptoDeposit(ref.id);
      outcome = "rechecked";
    } else if (input.decision === "approve") {
      const txHash = String(snapshot.get("txHash") || "");
      if (!txHash) throw new Error("A transaction hash is required before approval");
      const expectedAssetAmount = Number(snapshot.get("expectedAssetAmount"));
      const verification = await verifyCryptoPayment(snapshot.get("network") as CryptoNetwork, txHash);
      if (!verification.valid || !verification.confirmed) throw new Error(verification.reason || "The payment is not sufficiently confirmed on-chain");
      const quoteExpiry = snapshot.get("quoteExpiresAt")?.toMillis?.() || 0;
      if (verification.blockTime && verification.blockTime.getTime() > quoteExpiry + 5 * 60_000) throw new Error("The payment was made after the quoted rate expired");
      const requestedNgnMinor = Number(snapshot.get("requestedNgnMinor"));
      const creditedNgnMinor = cryptoCreditMinor({ actualAssetAmount: verification.amount, expectedAssetAmount, requestedNgnMinor });
      const posted = await postWallet({ userId: String(snapshot.get("userId")), type: "deposit", deltaMinor: creditedNgnMinor, currency: "NGN", idempotencyKey: `crypto:${String(snapshot.get("network"))}:${txHash}`, reference: ref.id });
      await ref.set({ status: "approved", approvedBy: admin.uid, approvedAt: FieldValue.serverTimestamp(), verifiedAmount: verification.amount, confirmations: verification.confirmations, creditedNgnMinor, paymentVarianceAsset: verification.amount - expectedAssetAmount, walletTransactionId: posted.transactionId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await db.collection("auditLogs").add({ action: "crypto_deposit_approved", targetType: "cryptoDeposit", targetId: ref.id, txHash, userId: snapshot.get("userId"), requestedNgnMinor, creditedNgnMinor, verifiedAmount: verification.amount, actorUid: admin.uid, createdAt: FieldValue.serverTimestamp() });
      await sendUserEmail(String(snapshot.get("userId")), { subject: "Your crypto payment has been credited", title: "Payment verified and credited", message: `Your confirmed crypto payment has added NGN ${(creditedNgnMinor / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })} to your Social Booster wallet.`, buttonLabel: "View wallet", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/dashboard/wallet` }).catch((error) => console.warn("[crypto-decision-email] delivery failed", { depositId: ref.id, error: error instanceof Error ? error.message : "Unknown error" }));
      outcome = "approved";
    } else {
      const finalStatus = input.decision === "reject" ? "rejected" : "cancelled";
      const reason = input.reason && input.reason.length >= 5 ? input.reason : input.decision === "reject" ? "Payment could not be verified" : "Payment request cancelled by administrator";
      await ref.set({ status: finalStatus, decisionReason: reason, decidedBy: admin.uid, decidedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await db.collection("auditLogs").add({ action: `crypto_deposit_${finalStatus}`, targetType: "cryptoDeposit", targetId: ref.id, reason, actorUid: admin.uid, createdAt: FieldValue.serverTimestamp() });
      await sendUserEmail(String(snapshot.get("userId")), { subject: `Crypto payment ${finalStatus}`, title: `Payment request ${finalStatus}`, message: `${reason}. No wallet credit was posted for this request. Contact support if you believe this needs review.`, buttonLabel: "Contact support", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/contact` }).catch((error) => console.warn("[crypto-decision-email] delivery failed", { depositId: ref.id, error: error instanceof Error ? error.message : "Unknown error" }));
      outcome = finalStatus;
    }
    revalidatePath("/admin/crypto"); revalidatePath("/dashboard/wallet"); revalidatePath("/dashboard/transactions");
  } catch (error) {
    console.error("[crypto-decision] action failed", { error: error instanceof Error ? error.message : "Unknown error" });
    outcome = "error";
  }
  redirect(`/admin/crypto?notice=${outcome}`);
}
