import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { verifyCryptoPayment, type CryptoNetwork } from "./crypto";
import { sendUserEmail } from "@/lib/email";

export async function reverifyCryptoDeposit(id: string) {
  const ref = adminDb().collection("cryptoDeposits").doc(id), snapshot = await ref.get();
  if (!snapshot.exists) throw new Error("Crypto deposit not found");
  const txHash = String(snapshot.get("txHash") || "");
  if (!txHash) throw new Error("Transaction hash is missing");
  const verification = await verifyCryptoPayment(snapshot.get("network") as CryptoNetwork, txHash);
  const status = verification.valid && verification.confirmed ? "verified_pending_approval" : verification.valid ? "confirming" : "verification_failed";
  await ref.set({ status, verifiedAmount: verification.amount, confirmations: verification.confirmations, verificationReason: verification.reason || null, blockTime: verification.blockTime || null, lastVerifiedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { status, ...verification };
}

export async function reverifyPendingCryptoDeposits(limit = 50) {
  const snapshot = await adminDb().collection("cryptoDeposits").where("status", "in", ["confirming", "verification_pending"]).limit(limit).get();
  let verified = 0;
  for (const doc of snapshot.docs) {
    try { const result = await reverifyCryptoDeposit(doc.id); if (result.status === "verified_pending_approval") verified += 1; }
    catch (error) { await doc.ref.set({ verificationReason: error instanceof Error ? error.message : "Verification service unavailable", updatedAt: FieldValue.serverTimestamp() }, { merge: true }); }
  }
  return { checked: snapshot.size, verified };
}

export async function expireAwaitingCryptoDeposits(limit = 100) {
  const snapshot = await adminDb().collection("cryptoDeposits").where("status", "==", "awaiting_payment").limit(limit).get();
  const now = Date.now(), expired = snapshot.docs.filter((doc) => (doc.get("quoteExpiresAt")?.toMillis?.() || 0) <= now);
  if (!expired.length) return 0;
  const batch = adminDb().batch();
  for (const doc of expired) batch.set(doc.ref, { status: "cancelled", decisionReason: "Payment window expired", cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  await Promise.all(expired.map((doc) => sendUserEmail(String(doc.get("userId")), { subject: "Crypto payment request expired", title: "Payment window closed", message: "The 18-minute payment window closed without a submitted transaction. No wallet credit was posted. You can request a new live quote whenever you are ready.", buttonLabel: "Get a new quote", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/dashboard/wallet` }).catch((error) => console.warn("[crypto-expiry-email] delivery failed", { depositId: doc.id, error: error instanceof Error ? error.message : "Unknown error" }))));
  return expired.length;
}
