import { FieldValue } from "firebase-admin/firestore";
import { currentUser } from "@/lib/firebase/session";
import { adminDb } from "@/lib/firebase/admin";
import { cryptoSubmissionSchema, verifyCryptoPayment, type CryptoNetwork } from "@/lib/payments/crypto";
import { sendAdminAlert, sendUserEmail } from "@/lib/email";

export async function POST(request: Request) {
  const user = await currentUser(true);
  if (!user) return Response.json({ error: "Sign in to submit a transaction" }, { status: 401 });
  const input = cryptoSubmissionSchema.parse(await request.json()), db = adminDb(), ref = db.collection("cryptoDeposits").doc(input.depositId), snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get("userId") !== user.uid) return Response.json({ error: "Payment request not found" }, { status: 404 });
  if (!["awaiting_payment", "verification_failed"].includes(String(snapshot.get("status")))) return Response.json({ error: "This payment request cannot be changed" }, { status: 409 });
  const expiresAt = snapshot.get("quoteExpiresAt")?.toMillis?.() || 0;
  if (expiresAt + 24 * 60 * 60_000 < Date.now()) return Response.json({ error: "This quote is too old. Request a new live quote." }, { status: 410 });
  const duplicate = await db.collection("cryptoDeposits").where("txHash", "==", input.txHash).limit(1).get();
  if (!duplicate.empty && duplicate.docs[0].id !== ref.id) return Response.json({ error: "This transaction hash has already been submitted" }, { status: 409 });
  await ref.set({ txHash: input.txHash, status: "verifying", submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  try {
    const verification = await verifyCryptoPayment(snapshot.get("network") as CryptoNetwork, input.txHash);
    const onTime = !verification.blockTime || verification.blockTime.getTime() <= expiresAt + 5 * 60_000;
    const status = verification.valid && verification.confirmed && onTime ? "verified_pending_approval" : verification.valid && onTime ? "confirming" : "verification_failed";
    if (!onTime) verification.reason = "The on-chain payment was made after this quote expired";
    await ref.set({ status, verifiedAmount: verification.amount, confirmations: verification.confirmations, verificationReason: verification.reason || null, blockTime: verification.blockTime || null, lastVerifiedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await sendAdminAlert({ subject: `Crypto payment submitted: ${status.replaceAll("_", " ")}`, title: "Crypto payment activity", message: `Customer ${user.email || user.uid} submitted a ${String(snapshot.get("network")).replaceAll("_", " ")} payment for NGN ${(Number(snapshot.get("requestedNgnMinor")) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}. Status: ${status.replaceAll("_", " ")}.`, buttonLabel: "Review crypto payment", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/admin/crypto` }).catch((error) => console.warn("[admin-crypto-email] delivery failed", { depositId: ref.id, error: error instanceof Error ? error.message : "Unknown error" }));
    await sendUserEmail(user.uid, { subject: "Crypto payment received for verification", title: status === "verified_pending_approval" ? "Payment verified" : "Payment verification update", message: status === "verified_pending_approval" ? "Your blockchain payment has been confirmed and is in secure review for wallet credit." : status === "confirming" ? "Your payment was found and is waiting for the required network confirmations." : verification.reason || "We could not verify this transaction. Please check the network and transaction hash.", buttonLabel: "View wallet", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/dashboard/wallet` }).catch((error) => console.warn("[crypto-customer-email] delivery failed", { depositId: ref.id, error: error instanceof Error ? error.message : "Unknown error" }));
    return Response.json({ ok: true, status, message: status === "verified_pending_approval" ? "Payment verified and sent for administrator approval." : status === "confirming" ? "Payment found and is waiting for more network confirmations." : verification.reason || "Payment could not be verified." });
  } catch (error) {
    await ref.set({ status: "verification_pending", verificationReason: error instanceof Error ? error.message : "Verification service unavailable", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return Response.json({ ok: true, status: "verification_pending", message: "Your transaction was saved. Automatic verification will retry before administrator review." });
  }
}
