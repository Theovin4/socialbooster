import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { verifyCryptoPayment, type CryptoNetwork } from "./crypto";

export async function reverifyCryptoDeposit(id: string) {
  const ref = adminDb().collection("cryptoDeposits").doc(id), snapshot = await ref.get();
  if (!snapshot.exists) throw new Error("Crypto deposit not found");
  const txHash = String(snapshot.get("txHash") || "");
  if (!txHash) throw new Error("Transaction hash is missing");
  const verification = await verifyCryptoPayment(snapshot.get("network") as CryptoNetwork, txHash, Number(snapshot.get("expectedAssetAmount")));
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
