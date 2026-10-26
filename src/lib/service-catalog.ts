import "server-only";
import { unstable_cache } from "next/cache";
import { providerDefinitions, type ProviderKey } from "./providers";
import {
  publicCatalogHash,
  readPublicCatalogSnapshotChunk,
  readPublicCatalogSnapshotDescriptor,
  recordPublicCatalogSnapshotFallback,
  type PublicCatalogSnapshotDescriptor,
  type PublicCatalogSnapshotItem,
  type PublicCatalogSnapshotVersion,
} from "./public-catalog-snapshot";
import { choosePreferredDuplicateServices, expandPublicServiceSemantics, matchesServiceSearch, publicServiceDescription, rankFeaturedServices, sanitizePublicCatalogCandidate, type PublicServiceSemantics } from "./service-quality";

export { publicServiceId } from "./service-public-id";

export const SERVICE_CATALOG_TAG = "active-service-catalog";

export type CachedService = {
  id: string;
  internalId: string;
  name: string;
  normalizedName: string;
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
  semantics: PublicServiceSemantics;
};

export type ServiceCatalogPage = {
  items: CachedService[];
  categories: string[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const getCachedSnapshotDescriptor = unstable_cache(
  async (provider: ProviderKey) => readPublicCatalogSnapshotDescriptor(provider),
  ["active-service-catalog-descriptor-v2"],
  { tags: [SERVICE_CATALOG_TAG] },
);

const getCachedSnapshotChunk = unstable_cache(
  async (provider: ProviderKey, version: PublicCatalogSnapshotVersion, slot: "a" | "b" | "legacy", index: number, hash: string) =>
    readPublicCatalogSnapshotChunk(provider, version, slot, index, hash || null),
  ["active-service-catalog-chunk-v2-immutable"],
);

type DescriptorSlot = PublicCatalogSnapshotDescriptor["active"];

async function loadDescriptorSlot(provider: ProviderKey, slot: DescriptorSlot): Promise<PublicCatalogSnapshotItem[] | null> {
  const version = slot.version;
  const chunks = await Promise.all(Array.from({ length: slot.chunkCount }, (_, index) =>
    getCachedSnapshotChunk(provider, version, slot.slot, index, slot.hash || ""),
  ));
  if (chunks.some((chunk) => !chunk)) return null;
  const items = chunks.flatMap((chunk) => chunk || []);
  if (slot.serviceCount !== null && items.length !== slot.serviceCount) return null;
  if (version >= 3 && slot.hash && publicCatalogHash(items) !== slot.hash) return null;
  return items;
}

async function loadProviderCatalog(provider: ProviderKey): Promise<PublicCatalogSnapshotItem[]> {
  const descriptor = await getCachedSnapshotDescriptor(provider);
  if (!descriptor) return [];
  const active = await loadDescriptorSlot(provider, descriptor.active);
  if (active) return active;
  if (descriptor.previous) {
    const previous = await loadDescriptorSlot(provider, descriptor.previous);
    if (previous) {
      await recordPublicCatalogSnapshotFallback(provider, true);
      return previous;
    }
  }
  await recordPublicCatalogSnapshotFallback(provider, false);
  return [];
}

/**
 * The catalogue is shared by every visitor. It is cached in bounded chunks so
 * no Vercel cache item can exceed the 2 MB platform limit.
 */
export async function getActiveServiceCatalog(): Promise<CachedService[]> {
  const providers = providerDefinitions().filter((provider) => provider.configured).map((provider) => provider.key);
  if (!providers.length) return [];
  const snapshots = await Promise.all(providers.map(loadProviderCatalog));
  return choosePreferredDuplicateServices(snapshots
    .flat()
    .map(sanitizePublicCatalogCandidate)
    .filter((item): item is PublicCatalogSnapshotItem & { normalizedName: string; semantics: PublicServiceSemantics } => item !== null)
    .map((item) => {
      const semantics = item.s ? expandPublicServiceSemantics(item.s) : item.semantics;
      return { ...item, semantics, description: publicServiceDescription({ ...item, semantics }), updatedAt: item.updatedAt || null };
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/** Curates platform examples from the eligible cached catalogue, not provider row order. */
export async function getFeaturedServices(query: string, limit = 6) {
  const normalized = query.trim().toLocaleLowerCase("en");
  const matches = (await getActiveServiceCatalog()).filter((service) => matchesServiceSearch(service, normalized));
  return rankFeaturedServices(matches).slice(0, Math.max(1, Math.min(20, Math.floor(limit))));
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
    (!query || matchesServiceSearch(item, query)),
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
  ["active-service-catalog-v11-display-title-page"],
  { tags: [SERVICE_CATALOG_TAG] },
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
