import { unstable_cache } from "next/cache";
import { FieldPath } from "firebase-admin/firestore";
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

const CATALOG_CHUNK_SIZE = 400;

type CatalogChunk = { items: CachedService[]; lastId: string | null; hasMore: boolean };

function getCatalogChunk(afterId: string) {
  return unstable_cache(async (): Promise<CatalogChunk> => {
    let query = adminDb().collection("services")
      .where("active", "==", true)
      .orderBy(FieldPath.documentId())
      .select("name", "categoryName", "type", "minQuantity", "maxQuantity", "refillSupported", "cancelSupported", "providerRateMinor", "updatedAt")
      .limit(CATALOG_CHUNK_SIZE);
    if (afterId) query = query.startAfter(afterId);
    const snapshot = await query.get();
    const items = snapshot.docs.map((doc) => {
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
    });
    return { items, lastId: snapshot.docs.at(-1)?.id || null, hasMore: snapshot.size === CATALOG_CHUNK_SIZE };
  }, ["active-service-catalog-v3-chunk", afterId || "start"], { revalidate: 86_400, tags: [SERVICE_CATALOG_TAG] })();
}

/**
 * The catalogue is shared by every visitor. It is cached in bounded chunks so
 * no Vercel cache item can exceed the 2 MB platform limit.
 */
export async function getActiveServiceCatalog(): Promise<CachedService[]> {
  const catalog: CachedService[] = [];
  let afterId = "";
  for (let page = 0; page < 100; page += 1) {
    const chunk = await getCatalogChunk(afterId);
    catalog.push(...chunk.items);
    if (!chunk.hasMore || !chunk.lastId || chunk.lastId === afterId) break;
    afterId = chunk.lastId;
  }
  return catalog.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

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
