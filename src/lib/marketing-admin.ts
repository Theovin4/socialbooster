import { unstable_cache } from "next/cache";
import { Timestamp, type Query } from "firebase-admin/firestore";
import { adminDb } from "./firebase/admin";
import { MARKETING_CAMPAIGN_COLLECTION, MARKETING_PROFILE_COLLECTION, VIP_LIFETIME_VALUE_MINOR, type MarketingSegmentId } from "./marketing";

function dayOffset(days: number) {
  return Timestamp.fromDate(new Date(Date.now() - days * 86_400_000));
}

function segmentQuery(segment: MarketingSegmentId): Query {
  const collection = adminDb().collection(MARKETING_PROFILE_COLLECTION);
  let query: Query = collection.where("marketingEligible", "==", true);
  if (segment === "active") query = query.where("lastOrderAt", ">=", dayOffset(30));
  if (segment === "at_risk") query = query.where("lastOrderAt", ">=", dayOffset(60)).where("lastOrderAt", "<", dayOffset(30));
  if (segment === "inactive") query = query.where("lastOrderAt", ">=", dayOffset(90)).where("lastOrderAt", "<", dayOffset(60));
  if (segment === "dormant") query = query.where("lastOrderAt", "<", dayOffset(90));
  if (segment === "funded_no_order") query = query.where("walletFunded", "==", true).where("completedOrderCount", "==", 0);
  if (segment === "repeat") query = query.where("completedOrderCount", ">=", 2);
  if (segment === "vip") query = query.where("lifetimeOrderValueMinor", ">=", VIP_LIFETIME_VALUE_MINOR);
  if (segment === "reseller_api") query = query.where("resellerOrApi", "==", true);
  if (segment === "crypto") query = query.where("hasUsedCrypto", "==", true);
  return query;
}

export async function marketingSegmentCount(segment: MarketingSegmentId) {
  const snapshot = await segmentQuery(segment).count().get();
  return Number(snapshot.data().count || 0);
}

async function loadMarketingOverview() {
  const db = adminDb();
  const segments: MarketingSegmentId[] = ["eligible", "active", "at_risk", "inactive", "dormant", "funded_no_order", "repeat", "vip", "reseller_api", "crypto"];
  const [counts, unsubscribed, suppressed, campaigns] = await Promise.all([
    Promise.all(segments.map(async (segment) => [segment, await marketingSegmentCount(segment)] as const)),
    db.collection(MARKETING_PROFILE_COLLECTION).where("marketingStatus", "==", "unsubscribed").count().get(),
    db.collection(MARKETING_PROFILE_COLLECTION).where("marketingStatus", "==", "suppressed").count().get(),
    db.collection(MARKETING_CAMPAIGN_COLLECTION).orderBy("createdAt", "desc").limit(20).get(),
  ]);
  return {
    counts: Object.fromEntries(counts) as Record<MarketingSegmentId, number>,
    unsubscribed: Number(unsubscribed.data().count || 0),
    suppressed: Number(suppressed.data().count || 0),
    campaigns: campaigns.docs.map((doc) => ({ id: doc.id, ...doc.data(), createdAt: doc.get("createdAt")?.toDate?.()?.toISOString() || null })),
  };
}

export const getMarketingOverview = unstable_cache(loadMarketingOverview, ["marketing-overview-v1"], { revalidate: 300 });
