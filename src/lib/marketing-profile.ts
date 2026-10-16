import { FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "./firebase/admin";
import { MARKETING_PROFILE_COLLECTION, marketingSegmentMemberships, normalizeEmail, type MarketingTopicId } from "./marketing";
import { synchronizeMarketingContact, synchronizeMarketingSegments, synchronizeMarketingTopics } from "./resend-marketing";
import { normalizeAcquisitionTouch, unattributedTouch, type GrowthContext } from "./acquisition";
import { recordAcquisitionCompletedOrder } from "./growth-server";
import { evaluateReferralReward, referralRewardRules } from "./referrals";
import { lagosDateKey } from "./firebase/stats";

export function createMarketingProfileInTransaction(transaction: Transaction, token: DecodedIdToken, created: boolean, growth: GrowthContext = {}) {
  if (!token.email || token.admin === true) return;
  const ref = adminDb().collection(MARKETING_PROFILE_COLLECTION).doc(token.uid);
  if (created) transaction.set(ref, {
    userId: token.uid,
    email: normalizeEmail(token.email),
    firstName: String(token.name || "").trim().split(/\s+/)[0] || null,
    marketingConsent: false,
    marketingEligible: false,
    marketingStatus: "active",
    emailStatus: "active",
    completedOrderCount: 0,
    lifetimeOrderValueMinor: 0,
    walletFunded: false,
    apiUser: false,
    resellerStatus: false,
    resellerInterest: growth.resellerInterest === true,
    resellerOrApi: growth.resellerInterest === true,
    firstTouch: growth.firstTouch || null,
    lastTouch: growth.lastTouch || growth.firstTouch || null,
    hasUsedCrypto: false,
    hasUsedCard: false,
    hasUsedBankTransfer: false,
    createdAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  else transaction.set(ref, {
    email: normalizeEmail(token.email),
    ...(growth.lastTouch ? { lastTouch: growth.lastTouch } : {}),
    ...(growth.resellerInterest === true ? { resellerInterest: true, resellerOrApi: true, resellerInterestAt: FieldValue.serverTimestamp() } : {}),
    lastLoginAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function setMarketingPreference(userId: string, subscribed: boolean, source: string, topics: Partial<Record<MarketingTopicId, boolean>> = {}) {
  const db = adminDb();
  const user = await adminAuth().getUser(userId);
  if (!user.email) throw new Error("This account has no email address");
  const ref = db.collection(MARKETING_PROFILE_COLLECTION).doc(userId);
  const profile = await ref.get();
  const emailStatus = String(profile.get("emailStatus") || "active");
  const blocked = ["bounced", "complained", "suppressed"].includes(emailStatus);
  const eligible = subscribed && !blocked;
  await ref.set({
    userId,
    email: normalizeEmail(user.email),
    firstName: profile.get("firstName") || user.displayName?.trim().split(/\s+/)[0] || null,
    marketingConsent: subscribed,
    marketingEligible: eligible,
    marketingStatus: subscribed ? (blocked ? "suppressed" : "active") : "unsubscribed",
    consentSource: source,
    consentRecordedAt: profile.get("consentRecordedAt") || FieldValue.serverTimestamp(),
    consentUpdatedAt: FieldValue.serverTimestamp(),
    topicPreferences: topics,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  try {
    await synchronizeMarketingContact({ email: user.email, firstName: profile.get("firstName") || user.displayName?.trim().split(/\s+/)[0], subscribed: eligible });
    const current = (await ref.get()).data() || {};
    await synchronizeMarketingSegments(user.email, marketingSegmentMemberships(current));
    if (eligible) await synchronizeMarketingTopics(user.email, topics);
    await ref.set({ providerSyncStatus: "synchronized", providerSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (error) {
    await ref.set({ providerSyncStatus: "attention_required", providerSyncError: error instanceof Error ? error.message.slice(0, 300) : "Provider sync failed", marketingEligible: subscribed ? false : eligible, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (subscribed) throw new Error("Your preference was saved, but email delivery is not available yet. Marketing messages will remain paused.");
  }
  return { subscribed, eligible };
}

export async function recordFundingMarketing(userId: string, method: "card" | "bank_transfer" | "crypto") {
  const flags = method === "crypto" ? { hasUsedCrypto: true } : method === "bank_transfer" ? { hasUsedBankTransfer: true } : { hasUsedCard: true };
  await adminDb().collection(MARKETING_PROFILE_COLLECTION).doc(userId).set({ walletFunded: true, lastPaymentMethod: method, lastFundedAt: FieldValue.serverTimestamp(), ...flags, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await synchronizeProfileMembership(userId);
}

export async function recordApiUserMarketing(userId: string) {
  await adminDb().collection(MARKETING_PROFILE_COLLECTION).doc(userId).set({ apiUser: true, resellerOrApi: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await synchronizeProfileMembership(userId);
}

export async function recordCompletedOrderMarketing(orderId: string) {
  const db = adminDb(), orderRef = db.collection("orders").doc(orderId);
  const appliedUserId = await db.runTransaction(async (transaction) => {
    const order = await transaction.get(orderRef);
    if (!order.exists || order.get("status") !== "completed" || order.get("marketingCompletionApplied") === true) return null;
    const userId = String(order.get("userId"));
    const profileRef = db.collection(MARKETING_PROFILE_COLLECTION).doc(userId);
    const profile = await transaction.get(profileRef);
    const completedBefore = Number(profile.get("completedOrderCount") || 0);
    const firstOrder = completedBefore === 0;
    const referralRef = db.collection("referrals").doc(userId);
    const referral = firstOrder ? await transaction.get(referralRef) : null;
    const settingsRef = db.collection("growthSettings").doc("referrals");
    const referredUserRef = db.collection("users").doc(userId);
    const [settings, referredUser] = referral?.exists
      ? await Promise.all([transaction.get(settingsRef), transaction.get(referredUserRef)])
      : [null, null];
    const rules = referral?.exists ? referralRewardRules(settings?.data()) : null;
    const monthKey = lagosDateKey().slice(0, 7);
    const monthlyRef = referral?.exists && rules?.enabled === true && rules.rewardMinor > 0
      ? db.collection("referralMonthly").doc(`${String(referral.get("referrerUserId"))}_${monthKey}`)
      : null;
    const monthly = monthlyRef ? await transaction.get(monthlyRef) : null;
    const customerPriceMinor = Number(order.get("customerPriceMinor") || 0);
    const refundedAmountMinor = Number(order.get("refundedAmountMinor") || 0);
    const revenueMinor = Math.max(0, customerPriceMinor - refundedAmountMinor);
    const providerCostIncurredMinor = order.get("providerAccepted") === true || Number.isInteger(order.get("providerOrderId"))
      ? Number(order.get("providerCostIncurredMinor") ?? order.get("providerCostMinor") ?? 0)
      : 0;
    const grossProfitMinor = revenueMinor - providerCostIncurredMinor;
    const firstTouch = normalizeAcquisitionTouch(profile.get("firstTouch")) || unattributedTouch();
    const lastTouch = normalizeAcquisitionTouch(profile.get("lastTouch")) || firstTouch;
    transaction.set(profileRef, {
      userId,
      completedOrderCount: FieldValue.increment(1),
      lifetimeOrderValueMinor: FieldValue.increment(customerPriceMinor),
      firstOrderAt: profile.get("firstOrderAt") || FieldValue.serverTimestamp(),
      lastOrderAt: FieldValue.serverTimestamp(),
      preferredPlatform: String(order.get("serviceName") || "").split(/\s+/)[0].toLowerCase() || null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(orderRef, { marketingCompletionApplied: true, marketingCompletionAppliedAt: FieldValue.serverTimestamp() }, { merge: true });
    recordAcquisitionCompletedOrder(transaction, { firstTouch, lastTouch, firstOrder, revenueMinor, grossProfitMinor });
    if (referral?.exists && rules) {
      const registeredAtValue = referredUser?.get("createdAt");
      const registeredAtMs = registeredAtValue instanceof Timestamp ? registeredAtValue.toMillis() : Date.now();
      const evaluation = evaluateReferralReward({
        rules,
        emailVerified: referredUser?.get("emailVerified") === true,
        firstOrderValueMinor: revenueMinor,
        registeredAtMs,
        completedAtMs: Date.now(),
        monthlyRewardCount: Number(monthly?.get("qualifiedCount") || 0),
      });
      transaction.set(referralRef, {
        status: "qualified",
        rewardStatus: evaluation.status,
        firstCompletedOrderId: orderId,
        firstCompletedOrderValueMinor: revenueMinor,
        riskFlags: evaluation.riskFlags,
        ruleVersion: rules.version,
        qualifiedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(db.collection("referralRewards").doc(userId), {
        referredUserId: userId,
        referrerUserId: referral.get("referrerUserId"),
        referralCode: referral.get("referralCode"),
        status: evaluation.status,
        amountMinor: evaluation.status === "pending_review" ? rules.rewardMinor : 0,
        automaticWalletCredit: false,
        firstCompletedOrderId: orderId,
        riskFlags: evaluation.riskFlags,
        ruleVersion: rules.version,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (evaluation.status === "pending_review" && monthlyRef) transaction.set(monthlyRef, {
        referrerUserId: referral.get("referrerUserId"),
        monthKey,
        qualifiedCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return userId;
  });
  if (appliedUserId) await synchronizeProfileMembership(appliedUserId);
  return Boolean(appliedUserId);
}

export async function synchronizeProfileMembership(userId: string) {
  const profile = await adminDb().collection(MARKETING_PROFILE_COLLECTION).doc(userId).get();
  if (!profile.exists || !profile.get("email")) return;
  const memberships = marketingSegmentMemberships(profile.data() || {});
  // Do not create provider traffic for customers who have never opted in.
  // Existing synchronized contacts are still processed so an unsubscribe or
  // suppression removes every segment membership immediately.
  if (!memberships.length && profile.get("providerSyncStatus") !== "synchronized") return;
  await synchronizeMarketingSegments(String(profile.get("email")), memberships);
}
