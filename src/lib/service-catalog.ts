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

export type ServiceCatalogPage = {
  items: CachedService[];
  categories: string[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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
      // Keep the shared list cache compact. Full descriptions remain in the
      // individual Firestore service document and are loaded only where a
      // dedicated service page needs them.
      description: "",
      min: Number(item.minQuantity || 1),
      max: Number(item.maxQuantity || 1),
      refill: item.refillSupported === true,
      cancel: item.cancelSupported === true,
      rateMinor: Number(serviceSellingRateNgnMinor(item)),
      updatedAt: item.updatedAt?.toDate?.().toISOString?.() || null,
    };
  }).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}, ["active-service-catalog-v2-compact"], { revalidate: 86_400, tags: [SERVICE_CATALOG_TAG] });

/**
 * Sends only one bounded page to the browser. The shared catalogue remains
 * cached on the server, so search and pagination do not add Firestore reads.
 */
export async function getServiceCatalogPage(input: {
  query?: string;
  category?: string;
  page?: number;
  pageSize?: number;
  selectedId?: string;
} = {}): Promise<ServiceCatalogPage> {
  const catalog = await getActiveServiceCatalog();
  const categories = Array.from(new Set(catalog.map((item) => item.category))).sort((a, b) => a.localeCompare(b));
  const query = (input.query || "").trim().toLocaleLowerCase("en");
  const category = (input.category || "").trim();
  const filtered = catalog.filter((item) =>
    (!category || item.category === category) &&
    (!query || `${item.id} ${item.name} ${item.category}`.toLocaleLowerCase("en").includes(query)),
  );
  const pageSize = Math.max(10, Math.min(100, Math.floor(input.pageSize || 50)));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedIndex = input.selectedId && !query && !category ? filtered.findIndex((item) => item.id === input.selectedId) : -1;
  const requestedPage = selectedIndex >= 0 && !input.page ? Math.floor(selectedIndex / pageSize) + 1 : Math.floor(input.page || 1);
  const page = Math.max(1, Math.min(totalPages, requestedPage));
  const start = (page - 1) * pageSize;
  return { items: filtered.slice(start, start + pageSize), categories, page, pageSize, total, totalPages };
}
