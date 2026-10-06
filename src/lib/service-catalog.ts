import "server-only";
import { unstable_cache } from "next/cache";
import { FieldPath } from "firebase-admin/firestore";
import { serviceSellingRateNgnMinor } from "./currency";
import { adminDb } from "./firebase/admin";
import { publicServiceId } from "./service-public-id";
import { normalizePublicServiceName } from "./service-quality";
import { providerDefinitions } from "./providers";
import { PUBLIC_CATALOG_SNAPSHOT_VERSION, type PublicCatalogSnapshotItem } from "./public-catalog-snapshot";

export { publicServiceId } from "./service-public-id";

export const SERVICE_CATALOG_TAG = "active-service-catalog";

export type CachedService = {
  id: string;
  internalId: string;
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
  seoEligible: boolean;
  featured: boolean;
  paidAdsEligible: boolean;
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
      .select("name", "publicName", "categoryName", "type", "minQuantity", "maxQuantity", "refillSupported", "cancelSupported", "providerRateMinor", "updatedAt", "seoEligible", "featured", "paidAdsEligible")
      .limit(CATALOG_CHUNK_SIZE);
    if (afterId) query = query.startAfter(afterId);
    const snapshot = await query.get();
    const items = snapshot.docs.map((doc) => {
    const item = doc.data();
    return {
      id: publicServiceId(doc.id),
      internalId: doc.id,
      name: String(item.publicName || normalizePublicServiceName(String(item.name || "Service"), String(item.categoryName || "Other"))),
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
      seoEligible: item.seoEligible === true,
      featured: item.featured === true,
      paidAdsEligible: item.paidAdsEligible === true,
    };
    });
    return { items, lastId: snapshot.docs.at(-1)?.id || null, hasMore: snapshot.size === CATALOG_CHUNK_SIZE };
  }, ["active-service-catalog-v7-chunk", afterId || "start"], { revalidate: 86_400, tags: [SERVICE_CATALOG_TAG] })();
}

const getMaterializedCatalog = unstable_cache(async (): Promise<CachedService[] | null> => {
  const db = adminDb();
  const providers = providerDefinitions().filter((provider) => provider.configured).map((provider) => provider.key);
  if (!providers.length) return null;
  const manifests = await db.getAll(...providers.map((provider) => db.collection("publicCatalogManifests").doc(provider)));
  if (manifests.some((snapshot) => !snapshot.exists || snapshot.get("version") !== PUBLIC_CATALOG_SNAPSHOT_VERSION)) return null;
  const refs = manifests.flatMap((manifest) => Array.from({ length: Number(manifest.get("chunkCount") || 0) }, (_, index) => db.collection("publicCatalogChunks").doc(`${manifest.id}_${String(index).padStart(4, "0")}`)));
  if (!refs.length) return [];
  const chunks = await db.getAll(...refs);
  const items = chunks.flatMap((snapshot) => snapshot.exists && snapshot.get("version") === PUBLIC_CATALOG_SNAPSHOT_VERSION ? snapshot.get("items") as PublicCatalogSnapshotItem[] : []).filter((item) => item.active !== false);
  return items.map((item) => ({ ...item, updatedAt: item.updatedAt || null }));
}, ["active-service-catalog-materialized-v1"], { revalidate: 86_400, tags: [SERVICE_CATALOG_TAG] });

/**
 * The catalogue is shared by every visitor. It is cached in bounded chunks so
 * no Vercel cache item can exceed the 2 MB platform limit.
 */
export async function getActiveServiceCatalog(): Promise<CachedService[]> {
  const materialized = await getMaterializedCatalog();
  if (materialized) return materialized.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
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
type ServiceCatalogPageInput = {
  query?: string;
  category?: string;
  page?: number;
  pageSize?: number;
  selectedId?: string;
};

async function buildServiceCatalogPage(input: ServiceCatalogPageInput): Promise<ServiceCatalogPage> {
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

const getCachedServiceCatalogPage = unstable_cache(
  async (query: string, category: string, page: number, pageSize: number, selectedId: string) =>
    buildServiceCatalogPage({ query, category, page, pageSize, selectedId }),
  ["active-service-catalog-v8-page"],
  { revalidate: 86_400, tags: [SERVICE_CATALOG_TAG] },
);

/**
 * Search, category filtering and pagination are resolved on the server. Each
 * small result page is cached independently, so repeated customer requests do
 * not rebuild or resend the full catalogue.
 */
export async function getServiceCatalogPage(input: ServiceCatalogPageInput = {}): Promise<ServiceCatalogPage> {
  const page = input.page ? Math.max(1, Math.floor(input.page)) : 0;
  const pageSize = Math.max(10, Math.min(100, Math.floor(input.pageSize || 50)));
  return getCachedServiceCatalogPage(
    (input.query || "").trim(),
    (input.category || "").trim(),
    page,
    pageSize,
    (input.selectedId || "").trim(),
  );
}

export async function getSeoEligibleServiceCatalog() {
  return (await getActiveServiceCatalog()).filter((service) => service.seoEligible);
}

/**
 * Converts a public Social Booster service code to its private Firestore ID.
 * Legacy internal IDs remain accepted server-side so existing API integrations
 * and saved links continue to work, but they are never returned to customers.
 */
export async function resolveServiceIdentifier(identifier: string): Promise<CachedService | null> {
  const normalized = identifier.trim();
  if (!normalized || normalized.length > 160) return null;
  const catalog = await getActiveServiceCatalog();
  return catalog.find((service) => service.id === normalized || service.internalId === normalized) || null;
}
