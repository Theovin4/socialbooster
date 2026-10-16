import "server-only";

import { createHash } from "node:crypto";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "./firebase/admin";
import { attributionDimensions, normalizeGrowthContext, unattributedTouch, type AcquisitionTouch, type GrowthContext } from "./acquisition";
import { referralCodeForUser, referralEmailHash } from "./referrals";

export const ACQUISITION_FIRST_COLLECTION = "acquisitionFirstTouchRollups";
export const ACQUISITION_LAST_COLLECTION = "acquisitionLastTouchRollups";

function rollupId(touch: AcquisitionTouch) {
  const dimensions = attributionDimensions(touch);
  return createHash("sha256").update(`${dimensions.source}\u0000${dimensions.medium}\u0000${dimensions.campaign}`).digest("hex").slice(0, 32);
}

function rollupRef(db: Firestore, model: "first_touch" | "last_touch", touch: AcquisitionTouch) {
  return db.collection(model === "first_touch" ? ACQUISITION_FIRST_COLLECTION : ACQUISITION_LAST_COLLECTION).doc(rollupId(touch));
}

function baseRollup(model: "first_touch" | "last_touch", touch: AcquisitionTouch) {
  return { model, ...attributionDimensions(touch), visitors: null, visitorSource: "GA4", updatedAt: FieldValue.serverTimestamp() };
}

export function resolvedRegistrationTouches(contextInput: unknown, validReferralCode?: string) {
  const context = normalizeGrowthContext(contextInput);
  const referralTouch = validReferralCode ? {
    source: "referral",
    medium: "referral",
    campaign: validReferralCode,
    landingPath: "/register",
    capturedAt: new Date().toISOString(),
  } satisfies AcquisitionTouch : undefined;
  const firstTouch = context.firstTouch || referralTouch || unattributedTouch();
  const lastTouch = context.lastTouch || referralTouch || firstTouch;
  return { context, firstTouch, lastTouch };
}

export function recordAcquisitionRegistration(transaction: Transaction, firstTouch: AcquisitionTouch, lastTouch: AcquisitionTouch) {
  const db = adminDb();
  transaction.set(rollupRef(db, "first_touch", firstTouch), { ...baseRollup("first_touch", firstTouch), registrations: FieldValue.increment(1) }, { merge: true });
  transaction.set(rollupRef(db, "last_touch", lastTouch), { ...baseRollup("last_touch", lastTouch), registrations: FieldValue.increment(1) }, { merge: true });
}

export function recordAcquisitionCompletedOrder(transaction: Transaction, input: {
  firstTouch: AcquisitionTouch;
  lastTouch: AcquisitionTouch;
  firstOrder: boolean;
  revenueMinor: number;
  grossProfitMinor: number;
}) {
  const db = adminDb();
  for (const [model, touch] of [["first_touch", input.firstTouch], ["last_touch", input.lastTouch]] as const) {
    transaction.set(rollupRef(db, model, touch), {
      ...baseRollup(model, touch),
      registrations: FieldValue.increment(0),
      completedOrders: FieldValue.increment(1),
      firstOrders: FieldValue.increment(input.firstOrder ? 1 : 0),
      repeatOrders: FieldValue.increment(input.firstOrder ? 0 : 1),
      revenueMinor: FieldValue.increment(input.revenueMinor),
      grossProfitMinor: FieldValue.increment(input.grossProfitMinor),
    }, { merge: true });
  }
}

export async function ensureReferralCode(userId: string, email?: string | null) {
  const db = adminDb(), code = referralCodeForUser(userId);
  const codeRef = db.collection("referralCodes").doc(userId), indexRef = db.collection("referralCodeIndex").doc(code);
  await db.runTransaction(async (transaction) => {
    const [codeSnapshot, indexSnapshot] = await Promise.all([transaction.get(codeRef), transaction.get(indexRef)]);
    if (indexSnapshot.exists && indexSnapshot.get("ownerUserId") !== userId) throw new Error("Referral code collision");
    if (!indexSnapshot.exists) transaction.create(indexRef, { code, ownerUserId: userId, ownerEmailHash: email ? referralEmailHash(email) : null, status: "active", createdAt: FieldValue.serverTimestamp() });
    if (!codeSnapshot.exists) transaction.create(codeRef, { code, ownerUserId: userId, status: "active", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  return code;
}

export function createReferralCodeInTransaction(transaction: Transaction, userId: string, email?: string | null, codeExists = false, indexExists = false) {
  const db = adminDb(), code = referralCodeForUser(userId);
  const indexData = { code, ownerUserId: userId, ownerEmailHash: email ? referralEmailHash(email) : null, status: "active", ...(indexExists ? {} : { createdAt: FieldValue.serverTimestamp() }) };
  const codeData = { code, ownerUserId: userId, status: "active", ...(codeExists ? {} : { createdAt: FieldValue.serverTimestamp() }), updatedAt: FieldValue.serverTimestamp() };
  transaction.set(db.collection("referralCodeIndex").doc(code), indexData, { merge: true });
  transaction.set(db.collection("referralCodes").doc(userId), codeData, { merge: true });
  return code;
}

export type { GrowthContext };
