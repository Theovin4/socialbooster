"use server";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/firebase/session";
import { adminDb } from "@/lib/firebase/admin";
import { postWallet } from "@/lib/firebase/wallet";
import { verifyCryptoPayment, type CryptoNetwork } from "@/lib/payments/crypto";
import { reverifyCryptoDeposit } from "@/lib/payments/crypto-reconcile";

const decisionSchema = z.object({ id: z.string().min(10), decision: z.enum(["approve", "reject", "cancel", "recheck"]), reason: z.string().trim().max(300).optional() });

export async function decideCryptoDeposit(formData: FormData) {
  const admin = await requireAdmin(), input = decisionSchema.parse(Object.fromEntries(formData)), db = adminDb(), ref = db.collection("cryptoDeposits").doc(input.id), snapshot = await ref.get();
  if (!snapshot.exists) throw new Error("Crypto deposit not found");
  const status = String(snapshot.get("status"));
  if (["approved", "rejected", "cancelled"].includes(status)) return;
  if (input.decision === "recheck") {
    await reverifyCryptoDeposit(ref.id);
    revalidatePath("/admin/crypto");
    return;
  }
  if (input.decision === "approve") {
    const txHash = String(snapshot.get("txHash") || "");
    if (!txHash) throw new Error("A transaction hash is required before approval");
    const verification = await verifyCryptoPayment(snapshot.get("network") as CryptoNetwork, txHash, Number(snapshot.get("expectedAssetAmount")));
    if (!verification.valid || !verification.confirmed) throw new Error(verification.reason || "The payment is not sufficiently confirmed on-chain");
    const quoteExpiry = snapshot.get("quoteExpiresAt")?.toMillis?.() || 0;
    if (verification.blockTime && verification.blockTime.getTime() > quoteExpiry + 5 * 60_000) throw new Error("The payment was made after the quoted rate expired");
    const posted = await postWallet({ userId: String(snapshot.get("userId")), type: "deposit", deltaMinor: Number(snapshot.get("requestedNgnMinor")), currency: "NGN", idempotencyKey: `crypto:${String(snapshot.get("network"))}:${txHash}`, reference: ref.id });
    await ref.set({ status: "approved", approvedBy: admin.uid, approvedAt: FieldValue.serverTimestamp(), verifiedAmount: verification.amount, confirmations: verification.confirmations, walletTransactionId: posted.transactionId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await db.collection("auditLogs").add({ action: "crypto_deposit_approved", targetType: "cryptoDeposit", targetId: ref.id, txHash, userId: snapshot.get("userId"), requestedNgnMinor: snapshot.get("requestedNgnMinor"), actorUid: admin.uid, createdAt: FieldValue.serverTimestamp() });
  } else {
    if (!input.reason || input.reason.length < 5) throw new Error("Enter a clear reason for rejection or cancellation");
    await ref.set({ status: input.decision === "reject" ? "rejected" : "cancelled", decisionReason: input.reason, decidedBy: admin.uid, decidedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await db.collection("auditLogs").add({ action: `crypto_deposit_${input.decision === "reject" ? "rejected" : "cancelled"}`, targetType: "cryptoDeposit", targetId: ref.id, reason: input.reason, actorUid: admin.uid, createdAt: FieldValue.serverTimestamp() });
  }
  revalidatePath("/admin/crypto"); revalidatePath("/dashboard/wallet"); revalidatePath("/dashboard/transactions");
}
