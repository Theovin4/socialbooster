import "server-only";
import { unstable_cache } from "next/cache";
import { adminDb } from "./firebase/admin";
import { buildPublicServiceDetails, type PublicServiceDetails } from "./service-description";
import type { CachedService } from "./service-catalog";
import { publicServiceId } from "./service-public-id";
import type { PublicServiceSemantics } from "./service-quality";

export const PUBLIC_SERVICE_DETAILS_TAG = "public-service-details";
export const publicServiceDetailsTag = (internalId: string) => `${PUBLIC_SERVICE_DETAILS_TAG}:${internalId}`;
export const publicServicePageTag = (publicId: string) => `public-service-page:${publicId}`;

function validStoredDetails(value: FirebaseFirestore.DocumentData | undefined, service: CachedService): PublicServiceDetails | null {
  if (!value || value.serviceId !== service.internalId || value.publicId !== service.id) return null;
  if (typeof value.fullDescription !== "string" || !value.fullDescription.trim() || value.fullDescription.length > 5_000) return null;
  if (typeof value.shortDescription !== "string" || typeof value.descriptionHash !== "string" || !/^[a-f0-9]{64}$/.test(value.descriptionHash)) return null;
  if (value.descriptionSource !== "provider" && value.descriptionSource !== "generated_fallback") return null;
  return { serviceId: service.internalId, publicId: service.id, fullDescription: value.fullDescription, shortDescription: value.shortDescription, descriptionHash: value.descriptionHash, descriptionSource: value.descriptionSource };
}

function cachedDetails(service: CachedService) {
  return unstable_cache(async () => {
    const doc = await adminDb().collection("publicServiceDetails").doc(service.internalId).get();
    return validStoredDetails(doc.data(), service) || buildPublicServiceDetails({ ...service, serviceId: service.internalId, publicId: service.id, providerDescription: "" });
  }, ["public-service-details-v1", service.internalId], { tags: [publicServiceDetailsTag(service.internalId)], revalidate: 300 });
}

/** One document read on a cold cache; repeated requests are served from the immutable details cache. */
export async function getPublicServiceDetails(service: CachedService) {
  return cachedDetails(service)();
}

function stringValue(value: unknown, maximum = 200) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : "";
}

function integerValue(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Resolves one public detail page without rebuilding the complete catalogue.
 * Only explicitly customer-safe service fields leave this function; provider
 * keys, provider IDs, upstream names, costs and credentials are never copied.
 */
function cachedPublicServicePage(publicId: string) {
  return unstable_cache(async () => {
    const db = adminDb();
    const matches = await db.collection("publicServiceDetails").where("publicId", "==", publicId).limit(2).get();
    if (matches.size !== 1) return null;
    const detailsDocument = matches.docs[0];
    const internalId = stringValue(detailsDocument.get("serviceId"), 180);
    if (!internalId || publicServiceId(internalId) !== publicId) return null;

    const document = await db.collection("services").doc(internalId).get();
    if (!document.exists || document.get("active") !== true || document.get("publicEligibility") !== "eligible") return null;
    const name = stringValue(document.get("publicName") || document.get("publicDisplayName"), 140);
    const category = stringValue(document.get("categoryName"), 120);
    const type = stringValue(document.get("type"), 120);
    const min = integerValue(document.get("minQuantity"));
    const max = integerValue(document.get("maxQuantity"));
    const rateMinor = integerValue(document.get("sellingRateMinor"));
    const semantics = document.get("publicSemantics") as PublicServiceSemantics | undefined;
    if (!name || !category || !type || min === null || max === null || max < min || rateMinor === null || !semantics || typeof semantics !== "object") return null;

    const service: CachedService = {
      id: publicId,
      internalId,
      name,
      normalizedName: name.toLocaleLowerCase("en"),
      category,
      type,
      description: stringValue(detailsDocument.get("shortDescription"), 500),
      min,
      max,
      refill: document.get("refillSupported") === true,
      cancel: document.get("cancelSupported") === true,
      rateMinor,
      updatedAt: document.get("updatedAt")?.toDate?.()?.toISOString?.() || null,
      seoEligible: document.get("seoEligible") === true,
      featured: document.get("featured") === true,
      paidAdsEligible: document.get("paidAdsEligible") === true,
      semantics,
    };
    const details = validStoredDetails(detailsDocument.data(), service);
    return details ? { service, details } : null;
  }, ["public-service-page-v1", publicId], { tags: ["active-service-catalog", publicServicePageTag(publicId)], revalidate: 300 });
}

export async function getPublicServicePage(publicId: string) {
  if (!/^SB-[A-F0-9]{16}$/.test(publicId)) return null;
  return cachedPublicServicePage(publicId)();
}
