import { unstable_cache } from "next/cache";
import { serviceSellingRateNgnMinor } from "./currency";
import { adminDb } from "./firebase/admin";

export const SERVICE_CATALOG_TAG = "active-service-catalog";

export type CachedService = {
  id: string;
  name: string;
  category: string;
  type: string;
  description: string;
  min: number;
  max: number;
  refill: boolean;
  cancel: boolean;
  rateMinor: number;
  updatedAt: string | null;
};

/**
 * The catalogue is shared by every visitor. Firestore is read once per cache
 * refresh instead of once per customer page view or API request.
 */
export const getActiveServiceCatalog = unstable_cache(async (): Promise<CachedService[]> => {
  const snapshot = await adminDb().collection("services").where("active", "==", true).get();
  return snapshot.docs.map((doc) => {
    const item = doc.data();
    return {
      id: doc.id,
      name: String(item.name || "Service"),
      category: String(item.categoryName || "Other"),
      type: String(item.type || "default"),
      description: String(item.description || "").trim().slice(0, 800),
      min: Number(item.minQuantity || 1),
      max: Number(item.maxQuantity || 1),
      refill: item.refillSupported === true,
      cancel: item.cancelSupported === true,
      rateMinor: Number(serviceSellingRateNgnMinor(item)),
      updatedAt: item.updatedAt?.toDate?.().toISOString?.() || null,
    };
  }).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}, ["active-service-catalog-v1"], { revalidate: 86_400, tags: [SERVICE_CATALOG_TAG] });
