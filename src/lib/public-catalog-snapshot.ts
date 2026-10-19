import "server-only";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase/admin";
import type { ProviderKey } from "./providers";

export const PUBLIC_CATALOG_SNAPSHOT_VERSION = 3;
export const PUBLIC_CATALOG_SNAPSHOT_CHUNK_SIZE = 200;
export type PublicCatalogSnapshotVersion = 1 | 2 | 3;

export type PublicCatalogSnapshotItem = {
  id: string;
  internalId: string;
  name: string;
  category: string;
  type: string;
  min: number;
  max: number;
  refill: boolean;
  cancel: boolean;
  rateMinor: number;
  updatedAt: string;
  seoEligible: boolean;
  featured: boolean;
  paidAdsEligible: boolean;
  active: boolean;
};

export type SnapshotSlot = "a" | "b";
export type SlotMetadata = { chunkCount: number; hash: string; serviceCount: number };
type SnapshotRead = { items: PublicCatalogSnapshotItem[]; hash: string | null; slot: SnapshotSlot | "legacy"; fallbackUsed: boolean };
export type PublicCatalogSnapshotDescriptor = {
  version: PublicCatalogSnapshotVersion;
  active: { slot: SnapshotSlot | "legacy"; chunkCount: number; serviceCount: number | null; hash: string | null };
  previous: { slot: SnapshotSlot; chunkCount: number; serviceCount: number; hash: string } | null;
};

export function compactPublicCatalogItem(item: PublicCatalogSnapshotItem): PublicCatalogSnapshotItem {
  return {
    id: item.id, internalId: item.internalId, name: item.name, category: item.category, type: item.type,
    min: item.min, max: item.max, refill: item.refill, cancel: item.cancel, rateMinor: item.rateMinor,
    updatedAt: item.updatedAt, seoEligible: item.seoEligible, featured: item.featured,
    paidAdsEligible: item.paidAdsEligible, active: item.active,
  };
}

function stableItem(item: PublicCatalogSnapshotItem) {
  return { id: item.id, internalId: item.internalId, name: item.name, category: item.category, type: item.type, min: item.min, max: item.max, refill: item.refill, cancel: item.cancel, rateMinor: item.rateMinor, seoEligible: item.seoEligible, featured: item.featured, paidAdsEligible: item.paidAdsEligible, active: item.active };
}

export function publicCatalogHash(items: PublicCatalogSnapshotItem[]) {
  const canonical = [...items].sort((left, right) => left.internalId.localeCompare(right.internalId)).map(stableItem);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function legacyPublicCatalogHash(items: PublicCatalogSnapshotItem[]) {
  const canonical = [...items].sort((left, right) => left.internalId.localeCompare(right.internalId)).map((item) => ({
    id: item.id, internalId: item.internalId, name: item.name, category: item.category, type: item.type,
    description: String((item as PublicCatalogSnapshotItem & { description?: string }).description || ""),
    min: item.min, max: item.max, refill: item.refill, cancel: item.cancel, rateMinor: item.rateMinor,
    seoEligible: item.seoEligible, featured: item.featured, paidAdsEligible: item.paidAdsEligible, active: item.active,
  }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function shouldPublishPublicSnapshot(previousHash: unknown, nextHash: string) {
  return previousHash !== nextHash;
}

function slotMetadata(value: unknown): SlotMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const chunkCount = Number(record.chunkCount), serviceCount = Number(record.serviceCount), hash = String(record.hash || "");
  if (!Number.isSafeInteger(chunkCount) || chunkCount < 0 || !Number.isSafeInteger(serviceCount) || serviceCount < 0 || !/^[a-f0-9]{64}$/.test(hash)) return null;
  return { chunkCount, serviceCount, hash };
}

async function readSlot(provider: ProviderKey, slot: SnapshotSlot, metadata: SlotMetadata, version: 2 | 3 = PUBLIC_CATALOG_SNAPSHOT_VERSION): Promise<PublicCatalogSnapshotItem[] | null> {
  const db = adminDb();
  const refs = Array.from({ length: metadata.chunkCount }, (_, index) => db.collection("publicCatalogChunks").doc(`${provider}_${slot}_${String(index).padStart(4, "0")}`));
  const chunks = refs.length ? await db.getAll(...refs) : [];
  if (chunks.some((chunk) => !chunk.exists || chunk.get("version") !== version || chunk.get("snapshotHash") !== metadata.hash)) return null;
  const items = chunks.flatMap((chunk) => (chunk.get("items") || []) as PublicCatalogSnapshotItem[]);
  const actualHash = version === 2 ? legacyPublicCatalogHash(items) : publicCatalogHash(items);
  if (items.length !== metadata.serviceCount || actualHash !== metadata.hash) return null;
  return items;
}

async function recordFallback(provider: ProviderKey, reason: string, recovered: boolean) {
  await adminDb().collection("operationsAlerts").doc(`publicCatalogFallback_${provider}`).set({
    type: "PUBLIC_CATALOGUE_FALLBACK_ACTIVATED", provider, reason, snapshotVersion: PUBLIC_CATALOG_SNAPSHOT_VERSION,
    recoveryResult: recovered ? "previous_snapshot_loaded" : "no_bounded_snapshot_available", active: !recovered,
    lastSeenAt: FieldValue.serverTimestamp(), activationCount: FieldValue.increment(1),
  }, { merge: true }).catch(() => undefined);
}

/**
 * Reads only the tiny manifest. Catalogue consumers cache this separately from
 * the immutable chunks so no Next.js cache entry can exceed Vercel's 2 MB
 * item limit.
 */
export async function readPublicCatalogSnapshotDescriptor(provider: ProviderKey): Promise<PublicCatalogSnapshotDescriptor | null> {
  const manifest = await adminDb().collection("publicCatalogManifests").doc(provider).get();
  if (!manifest.exists) { await recordFallback(provider, "manifest_missing", false); return null; }
  if (manifest.get("version") === 2 || manifest.get("version") === PUBLIC_CATALOG_SNAPSHOT_VERSION) {
    const version = manifest.get("version") as 2 | 3;
    const activeSlot: SnapshotSlot = manifest.get("activeSlot") === "b" ? "b" : "a";
    const previousSlot: SnapshotSlot | null = manifest.get("previousSlot") === "b" ? "b" : manifest.get("previousSlot") === "a" ? "a" : null;
    const slots = (manifest.get("slots") || {}) as Record<string, unknown>;
    const active = slotMetadata(slots[activeSlot]);
    const previous = previousSlot ? slotMetadata(slots[previousSlot]) : null;
    if (!active) { await recordFallback(provider, "active_snapshot_manifest_invalid", Boolean(previous)); }
    return active ? {
      version,
      active: { slot: activeSlot, ...active },
      previous: previousSlot && previous ? { slot: previousSlot, ...previous } : null,
    } : previousSlot && previous ? {
      version,
      active: { slot: previousSlot, ...previous },
      previous: null,
    } : null;
  }
  if (manifest.get("version") === 1) {
    const chunkCount = Number(manifest.get("chunkCount") || 0);
    if (!Number.isSafeInteger(chunkCount) || chunkCount < 0 || chunkCount > 100) return null;
    const serviceCountValue = Number(manifest.get("serviceCount"));
    return {
      version: 1,
      active: { slot: "legacy", chunkCount, serviceCount: Number.isSafeInteger(serviceCountValue) && serviceCountValue >= 0 ? serviceCountValue : null, hash: null },
      previous: null,
    };
  }
  return null;
}

/** One bounded immutable chunk read, suitable for an individual cache entry. */
export async function readPublicCatalogSnapshotChunk(
  provider: ProviderKey,
  version: PublicCatalogSnapshotVersion,
  slot: SnapshotSlot | "legacy",
  index: number,
  expectedHash: string | null,
): Promise<PublicCatalogSnapshotItem[] | null> {
  if (!Number.isSafeInteger(index) || index < 0 || index > 9999) return null;
  const id = version === 1
    ? `${provider}_${String(index).padStart(4, "0")}`
    : `${provider}_${slot}_${String(index).padStart(4, "0")}`;
  const chunk = await adminDb().collection("publicCatalogChunks").doc(id).get();
  if (!chunk.exists || chunk.get("version") !== version) return null;
  if (version >= 2 && (slot === "legacy" || chunk.get("snapshotHash") !== expectedHash)) return null;
  const items = chunk.get("items");
  return Array.isArray(items) ? items as PublicCatalogSnapshotItem[] : null;
}

export async function recordPublicCatalogSnapshotFallback(provider: ProviderKey, recovered: boolean) {
  await recordFallback(provider, "cached_active_snapshot_invalid", recovered);
}

/** Reads only manifest-bounded snapshots. It never scans the services collection. */
export async function readPublicCatalogSnapshot(provider: ProviderKey): Promise<SnapshotRead | null> {
  const db = adminDb(), manifest = await db.collection("publicCatalogManifests").doc(provider).get();
  if (!manifest.exists) { await recordFallback(provider, "manifest_missing", false); return null; }
  if (manifest.get("version") === 2 || manifest.get("version") === PUBLIC_CATALOG_SNAPSHOT_VERSION) {
    const version = manifest.get("version") as 2 | 3;
    const activeSlot: SnapshotSlot = manifest.get("activeSlot") === "b" ? "b" : "a";
    const previousSlot: SnapshotSlot | null = manifest.get("previousSlot") === "b" ? "b" : manifest.get("previousSlot") === "a" ? "a" : null;
    const slots = (manifest.get("slots") || {}) as Record<string, unknown>;
    const activeMetadata = slotMetadata(slots[activeSlot]);
    if (activeMetadata) {
      const activeItems = await readSlot(provider, activeSlot, activeMetadata, version);
      if (activeItems) return { items: activeItems, hash: activeMetadata.hash, slot: activeSlot, fallbackUsed: false };
    }
    if (previousSlot) {
      const previousMetadata = slotMetadata(slots[previousSlot]);
      if (previousMetadata) {
        const previousItems = await readSlot(provider, previousSlot, previousMetadata, version);
        if (previousItems) { await recordFallback(provider, "active_snapshot_invalid", true); return { items: previousItems, hash: previousMetadata.hash, slot: previousSlot, fallbackUsed: true }; }
      }
    }
    await recordFallback(provider, "active_and_previous_snapshots_invalid", false);
    return null;
  }
  // Read-only compatibility with the original bounded snapshot format.
  if (manifest.get("version") === 1) {
    const chunkCount = Number(manifest.get("chunkCount") || 0);
    if (!Number.isSafeInteger(chunkCount) || chunkCount < 0 || chunkCount > 100) return null;
    const refs = Array.from({ length: chunkCount }, (_, index) => db.collection("publicCatalogChunks").doc(`${provider}_${String(index).padStart(4, "0")}`));
    const chunks = refs.length ? await db.getAll(...refs) : [];
    if (chunks.some((chunk) => !chunk.exists || chunk.get("version") !== 1)) return null;
    const items = chunks.flatMap((chunk) => (chunk.get("items") || []) as PublicCatalogSnapshotItem[]);
    return { items, hash: publicCatalogHash(items), slot: "legacy", fallbackUsed: false };
  }
  return null;
}

export async function writePublicCatalogSnapshot(provider: ProviderKey, items: PublicCatalogSnapshotItem[]) {
  const db = adminDb(), manifestRef = db.collection("publicCatalogManifests").doc(provider), previous = await manifestRef.get();
  const compactItems = items.map(compactPublicCatalogItem);
  const nextHash = publicCatalogHash(compactItems);
  if (previous.get("version") === PUBLIC_CATALOG_SNAPSHOT_VERSION && !shouldPublishPublicSnapshot(previous.get("activeHash"), nextHash)) return { changed: false, chunkCount: Number(previous.get("chunkCount") || 0), serviceCount: compactItems.length, hash: nextHash };
  const currentSlot: SnapshotSlot = previous.get("activeSlot") === "b" ? "b" : "a";
  const hasSlottedSnapshot = previous.get("version") === 2 || previous.get("version") === PUBLIC_CATALOG_SNAPSHOT_VERSION;
  const nextSlot: SnapshotSlot = hasSlottedSnapshot ? (currentSlot === "a" ? "b" : "a") : "a";
  const chunkCount = Math.ceil(compactItems.length / PUBLIC_CATALOG_SNAPSHOT_CHUNK_SIZE);
  const writer = db.bulkWriter(); writer.onWriteError((error) => error.failedAttempts < 3);
  for (let index = 0; index < chunkCount; index += 1) {
    const chunk = compactItems.slice(index * PUBLIC_CATALOG_SNAPSHOT_CHUNK_SIZE, (index + 1) * PUBLIC_CATALOG_SNAPSHOT_CHUNK_SIZE);
    writer.set(db.collection("publicCatalogChunks").doc(`${provider}_${nextSlot}_${String(index).padStart(4, "0")}`), { provider, slot: nextSlot, version: PUBLIC_CATALOG_SNAPSHOT_VERSION, snapshotHash: nextHash, items: chunk, updatedAt: FieldValue.serverTimestamp() });
  }
  await writer.close();
  const existingSlots = previous.get("version") === PUBLIC_CATALOG_SNAPSHOT_VERSION ? ((previous.get("slots") || {}) as Record<string, unknown>) : {};
  const slots = { ...existingSlots, [nextSlot]: { chunkCount, serviceCount: compactItems.length, hash: nextHash } };
  await manifestRef.set({ provider, version: PUBLIC_CATALOG_SNAPSHOT_VERSION, activeSlot: nextSlot, previousSlot: previous.get("version") === PUBLIC_CATALOG_SNAPSHOT_VERSION ? currentSlot : null, activeHash: nextHash, chunkCount, serviceCount: compactItems.length, slots, updatedAt: FieldValue.serverTimestamp() });
  return { changed: true, chunkCount, serviceCount: compactItems.length, hash: nextHash };
}

/** Admin decisions publish through a new slot, preserving immutable snapshots. */
export async function patchPublicCatalogSnapshotService(provider: ProviderKey, internalId: string, changes: Partial<Pick<PublicCatalogSnapshotItem, "active" | "featured" | "seoEligible" | "paidAdsEligible" | "rateMinor">>) {
  const snapshot = await readPublicCatalogSnapshot(provider);
  if (!snapshot) return false;
  const index = snapshot.items.findIndex((item) => item.internalId === internalId);
  if (index < 0) return false;
  const items = [...snapshot.items]; items[index] = { ...items[index], ...changes, updatedAt: new Date().toISOString() };
  const result = await writePublicCatalogSnapshot(provider, items);
  return result.changed;
}
