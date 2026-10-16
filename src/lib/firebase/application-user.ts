import { createHash } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./admin";
import { recordNewCustomer, totalsDocument } from "./stats";
import { createMarketingProfileInTransaction } from "../marketing-profile";
import { normalizeGrowthContext } from "../acquisition";
import { createReferralCodeInTransaction, recordAcquisitionRegistration, resolvedRegistrationTouches } from "../growth-server";
import { referralCodeForUser, referralEmailHash } from "../referrals";

export async function ensureApplicationUser(token: DecodedIdToken, growthInput?: unknown) {
  const db = adminDb(), userRef = db.collection("users").doc(token.uid), walletRef = db.collection("wallets").doc(token.uid), statsRef = totalsDocument();
  const normalizedEmail = token.email?.trim().toLowerCase() || null;
  const growth = normalizeGrowthContext(growthInput);
  const emailRef = normalizedEmail ? db.collection("customerEmailIndex").doc(createHash("sha256").update(normalizedEmail).digest("hex")) : null;
  const created = await db.runTransaction(async (transaction) => {
    const [profile, wallet, emailIndex] = await Promise.all([
      transaction.get(userRef),
      transaction.get(walletRef),
      emailRef ? transaction.get(emailRef) : Promise.resolve(null),
    ]);
    const totals = !profile.exists && token.admin !== true ? await transaction.get(statsRef) : null;
    const submittedReferral = !profile.exists && growth.referralCode
      ? await transaction.get(db.collection("referralCodeIndex").doc(growth.referralCode))
      : null;
    const ownReferralCode = referralCodeForUser(token.uid);
    const [ownReferral, ownReferralIndex] = !profile.exists && token.admin !== true
      ? await Promise.all([
        transaction.get(db.collection("referralCodes").doc(token.uid)),
        transaction.get(db.collection("referralCodeIndex").doc(ownReferralCode)),
      ])
      : [null, null];
    if (emailIndex?.exists && emailIndex.get("userId") !== token.uid) throw new Error("EMAIL_IDENTITY_CONFLICT");
    if (ownReferralIndex?.exists && ownReferralIndex.get("ownerUserId") !== token.uid) throw new Error("REFERRAL_CODE_CONFLICT");
    const referrerUserId = submittedReferral?.exists && submittedReferral.get("status") === "active"
      && submittedReferral.get("ownerUserId") !== token.uid
      && (!normalizedEmail || submittedReferral.get("ownerEmailHash") !== referralEmailHash(normalizedEmail))
      ? String(submittedReferral.get("ownerUserId"))
      : null;
    const touches = resolvedRegistrationTouches(growth, referrerUserId ? growth.referralCode : undefined);
    if (emailRef && !emailIndex?.exists) transaction.create(emailRef, { userId: token.uid, createdAt: FieldValue.serverTimestamp() });
    if (!profile.exists) {
      transaction.create(userRef, {
        userId: token.uid,
        email: normalizedEmail,
        displayName: token.name || null,
        photoUrl: token.picture || null,
        role: token.admin === true ? "admin" : "customer",
        emailVerified: token.email_verified === true,
        firstTouch: touches.firstTouch,
        lastTouch: touches.lastTouch,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastLoginAt: FieldValue.serverTimestamp(),
      });
      if (totals) recordNewCustomer(transaction, totals);
      createMarketingProfileInTransaction(transaction, token, true, { ...growth, firstTouch: touches.firstTouch, lastTouch: touches.lastTouch });
      if (token.admin !== true) {
        recordAcquisitionRegistration(transaction, touches.firstTouch, touches.lastTouch);
        createReferralCodeInTransaction(transaction, token.uid, normalizedEmail, ownReferral?.exists === true, ownReferralIndex?.exists === true);
      }
      if (referrerUserId) transaction.create(db.collection("referrals").doc(token.uid), {
        referredUserId: token.uid,
        referrerUserId,
        referralCode: growth.referralCode,
        status: "registered",
        rewardStatus: "not_qualified",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (growth.resellerInterest === true && token.admin !== true) transaction.set(db.collection("resellerInterests").doc(token.uid), {
        userId: token.uid,
        status: "interested",
        source: "registration",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    else {
      transaction.set(userRef, { emailVerified: token.email_verified === true, lastLoginAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      createMarketingProfileInTransaction(transaction, token, false, growth);
      if (growth.resellerInterest === true && token.admin !== true) transaction.set(db.collection("resellerInterests").doc(token.uid), {
        userId: token.uid,
        status: "interested",
        source: "login",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    if (!wallet.exists) transaction.create(walletRef, { userId: token.uid, currency: "NGN", availableMinor: 0, reservedMinor: 0, balanceMinor: 0, version: 1, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return !profile.exists;
  });
  return { created };
}
