import "server-only";

import { unstable_cache } from "next/cache";
import { adminDb } from "./firebase/admin";
import { ACQUISITION_FIRST_COLLECTION, ACQUISITION_LAST_COLLECTION } from "./growth-server";
import { referralRewardRules } from "./referrals";

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadAcquisitionOverview() {
  const db = adminDb();
  const [first, last, referralCount, qualifiedCount, pendingRewards, pendingRewardItems, resellerInterests, settings] = await Promise.all([
    db.collection(ACQUISITION_FIRST_COLLECTION).orderBy("registrations", "desc").limit(50).get(),
    db.collection(ACQUISITION_LAST_COLLECTION).orderBy("registrations", "desc").limit(50).get(),
    db.collection("referrals").count().get(),
    db.collection("referrals").where("status", "==", "qualified").count().get(),
    db.collection("referralRewards").where("status", "==", "pending_review").count().get(),
    db.collection("referralRewards").where("status", "==", "pending_review").limit(25).get(),
    db.collection("resellerInterests").count().get(),
    db.collection("growthSettings").doc("referrals").get(),
  ]);
  const rows = (snapshot: typeof first) => snapshot.docs.map((doc) => ({
    id: doc.id,
    source: String(doc.get("source") || "direct_or_unknown"),
    medium: String(doc.get("medium") || "none"),
    campaign: String(doc.get("campaign") || "unattributed"),
    visitors: doc.get("visitors") == null ? null : number(doc.get("visitors")),
    registrations: number(doc.get("registrations")),
    firstOrders: number(doc.get("firstOrders")),
    repeatOrders: number(doc.get("repeatOrders")),
    revenueMinor: number(doc.get("revenueMinor")),
    grossProfitMinor: number(doc.get("grossProfitMinor")),
  }));
  return {
    firstTouch: rows(first),
    lastTouch: rows(last),
    referrals: number(referralCount.data().count),
    qualifiedReferrals: number(qualifiedCount.data().count),
    pendingRewards: number(pendingRewards.data().count),
    pendingRewardItems: pendingRewardItems.docs.map((doc) => ({ id: doc.id, referralCode: String(doc.get("referralCode") || ""), amountMinor: number(doc.get("amountMinor")), firstCompletedOrderId: String(doc.get("firstCompletedOrderId") || "") })),
    resellerInterests: number(resellerInterests.data().count),
    rules: referralRewardRules(settings.data()),
    asOf: new Date().toISOString(),
  };
}

export const getAcquisitionOverview = unstable_cache(loadAcquisitionOverview, ["acquisition-overview-v1"], { revalidate: 300 });
