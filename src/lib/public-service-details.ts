import "server-only";
import { unstable_cache } from "next/cache";
import { adminDb } from "./firebase/admin";
import { buildPublicServiceDetails, type PublicServiceDetails } from "./service-description";
import type { CachedService } from "./service-catalog";

export const PUBLIC_SERVICE_DETAILS_TAG = "public-service-details";
export const publicServiceDetailsTag = (internalId: string) => `${PUBLIC_SERVICE_DETAILS_TAG}:${internalId}`;

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
