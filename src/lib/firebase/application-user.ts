import { createHash } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./admin";
import { recordNewCustomer, totalsDocument } from "./stats";

export async function ensureApplicationUser(token: DecodedIdToken) {
  const db = adminDb(), userRef = db.collection("users").doc(token.uid), walletRef = db.collection("wallets").doc(token.uid), statsRef = totalsDocument();
  const normalizedEmail = token.email?.trim().toLowerCase() || null;
  const emailRef = normalizedEmail ? db.collection("customerEmailIndex").doc(createHash("sha256").update(normalizedEmail).digest("hex")) : null;
  await db.runTransaction(async (transaction) => {
    const [profile, wallet, emailIndex] = await Promise.all([
      transaction.get(userRef),
      transaction.get(walletRef),
      emailRef ? transaction.get(emailRef) : Promise.resolve(null),
    ]);
    const totals = !profile.exists && token.admin !== true ? await transaction.get(statsRef) : null;
    if (emailIndex?.exists && emailIndex.get("userId") !== token.uid) throw new Error("EMAIL_IDENTITY_CONFLICT");
    if (emailRef && !emailIndex?.exists) transaction.create(emailRef, { userId: token.uid, createdAt: FieldValue.serverTimestamp() });
    if (!profile.exists) {
      transaction.create(userRef, {
        userId: token.uid,
        email: normalizedEmail,
        displayName: token.name || null,
        photoUrl: token.picture || null,
        role: token.admin === true ? "admin" : "customer",
        emailVerified: token.email_verified === true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastLoginAt: FieldValue.serverTimestamp(),
      });
      if (totals) recordNewCustomer(transaction, totals);
    }
    else transaction.set(userRef, { emailVerified: token.email_verified === true, lastLoginAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (!wallet.exists) transaction.create(walletRef, { userId: token.uid, currency: "NGN", availableMinor: 0, reservedMinor: 0, balanceMinor: 0, version: 1, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
}
