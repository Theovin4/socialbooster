import "server-only";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase/admin";
import type { ProviderKey } from "./providers";

export const PUBLIC_CATALOG_SNAPSHOT_VERSION = 2;
export const PUBLIC_CATALOG_SNAPSHOT_CHUNK_SIZE = 200;

export type PublicCatalogSnapshotItem = {
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
  updatedAt: string;
  seoEligible: boolean;
  featured: boolean;
  paidAdsEligible: boolean;
  active: boolean;
};

type SnapshotSlot = "a" | "b";
type SlotMetadata = { chunkCount: number; hash: string; serviceCount: number };
type SnapshotRead = { items: PublicCatalogSnapshotItem[]; hash: string | null; slot: SnapshotSlot | "legacy"; fallbackUsed: boolean };

function stableItem(item: PublicCatalogSnapshotItem) {
  return { id: item.id, internalId: item.internalId, name: item.name, category: item.category, type: item.type, description: item.description, min: item.min, max: item.max, refill: item.refill, cancel: item.cancel, rateMinor: item.rateMinor, seoEligible: item.seoEligible, featured: item.featured, paidAdsEligible: item.paidAdsEligible, active: item.active };
}

export function publicCatalogHash(items: PublicCatalogSnapshotItem[]) {
  const canonical = [...items].sort((left, right) => left.internalId.localeCompare(right.internalId)).map(stableItem);
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

async function readSlot(provider: ProviderKey, slot: SnapshotSlot, metadata: SlotMetadata): Promise<PublicCatalogSnapshotItem[] | null> {
  const db = adminDb();
  const refs = Array.from({ length: metadata.chunkCount }, (_, index) => db.collection("publicCatalogChunks").doc(`${provider}_${slot}_${String(index).padStart(4, "0")}`));
  const chunks = refs.length ? await db.getAll(...refs) : [];
  if (chunks.some((chunk) => !chunk.exists || chunk.get("version") !== PUBLIC_CATALOG_SNAPSHOT_VERSION || chunk.get("snapshotHash") !== metadata.hash)) return null;
  const items = chunks.flatMap((chunk) => (chunk.get("items") || []) as PublicCatalogSnapshotItem[]);
  if (items.length !== metadata.serviceCount || publicCatalogHash(items) !== metadata.hash) return null;
  return items;
}

async function recordFallback(provider: ProviderKey, reason: string, recovered: boolean) {
  await adminDb().collection("operationsAlerts").doc(`publicCatalogFallback_${provider}`).set({
    type: "PUBLIC_CATALOGUE_FALLBACK_ACTIVATED", provider, reason, snapshotVersion: PUBLIC_CATALOG_SNAPSHOT_VERSION,
    recoveryResult: recovered ? "previous_snapshot_loaded" : "no_bounded_snapshot_available", active: !recovered,
    lastSeenAt: FieldValue.serverTimestamp(), activationCount: FieldValue.increment(1),
  }, { merge: true }).catch(() => undefined);
}

/** Reads only manifest-bounded snapshots. It never scans the services collection. */
export async function readPublicCatalogSnapshot(provider: ProviderKey): Promise<SnapshotRead | null> {
  const db = adminDb(), manifest = await db.collection("publicCatalogManifests").doc(provider).get();
  if (!manifest.exists) { await recordFallback(provider, "manifest_missing", false); return null; }
  if (manifest.get("version") === PUBLIC_CATALOG_SNAPSHOT_VERSION) {
    const activeSlot: SnapshotSlot = manifest.get("activeSlot") === "b" ? "b" : "a";
    const previousSlot: SnapshotSlot | null = manifest.get("previousSlot") === "b" ? "b" : manifest.get("previousSlot") === "a" ? "a" : null;
    const slots = (manifest.get("slots") || {}) as Record<string, unknown>;
    const activeMetadata = slotMetadata(slots[activeSlot]);
    if (activeMetadata) {
      const activeItems = await readSlot(provider, activeSlot, activeMetadata);
      if (activeItems) return { items: activeItems, hash: activeMetadata.hash, slot: activeSlot, fallbackUsed: false };
    }
    if (previousSlot) {
      const previousMetadata = slotMetadata(slots[previousSlot]);
      if (previousMetadata) {
        const previousItems = await readSlot(provider, previousSlot, previousMetadata);
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
  const nextHash = publicCatalogHash(items);
  if (previous.get("version") === PUBLIC_CATALOG_SNAPSHOT_VERSION && !shouldPublishPublicSnapshot(previous.get("activeHash"), nextHash)) return { changed: false, chunkCount: Number(previous.get("chunkCount") || 0), serviceCount: items.length, hash: nextHash };
  const currentSlot: SnapshotSlot = previous.get("activeSlot") === "b" ? "b" : "a";
  const nextSlot: SnapshotSlot = previous.get("version") === PUBLIC_CATALOG_SNAPSHOT_VERSION && currentSlot === "a" ? "b" : "a";
  const chunkCount = Math.ceil(items.length / PUBLIC_CATALOG_SNAPSHOT_CHUNK_SIZE);
  const writer = db.bulkWriter(); writer.onWriteError((error) => error.failedAttempts < 3);
  for (let index = 0; index < chunkCount; index += 1) {
    const chunk = items.slice(index * PUBLIC_CATALOG_SNAPSHOT_CHUNK_SIZE, (index + 1) * PUBLIC_CATALOG_SNAPSHOT_CHUNK_SIZE);
    writer.set(db.collection("publicCatalogChunks").doc(`${provider}_${nextSlot}_${String(index).padStart(4, "0")}`), { provider, slot: nextSlot, version: PUBLIC_CATALOG_SNAPSHOT_VERSION, snapshotHash: nextHash, items: chunk, updatedAt: FieldValue.serverTimestamp() });
  }
  await writer.close();
  const existingSlots = previous.get("version") === PUBLIC_CATALOG_SNAPSHOT_VERSION ? ((previous.get("slots") || {}) as Record<string, unknown>) : {};
  const slots = { ...existingSlots, [nextSlot]: { chunkCount, serviceCount: items.length, hash: nextHash } };
  await manifestRef.set({ provider, version: PUBLIC_CATALOG_SNAPSHOT_VERSION, activeSlot: nextSlot, previousSlot: previous.get("version") === PUBLIC_CATALOG_SNAPSHOT_VERSION ? currentSlot : null, activeHash: nextHash, chunkCount, serviceCount: items.length, slots, updatedAt: FieldValue.serverTimestamp() });
  return { changed: true, chunkCount, serviceCount: items.length, hash: nextHash };
}

/** Admin decisions publish through a new slot, preserving immutable snapshots. */
export async function patchPublicCatalogSnapshotService(provider: ProviderKey, internalId: string, changes: Partial<Pick<PublicCatalogSnapshotItem, "active" | "featured" | "seoEligible" | "paidAdsEligible">>) {
  const snapshot = await readPublicCatalogSnapshot(provider);
  if (!snapshot) return false;
  const index = snapshot.items.findIndex((item) => item.internalId === internalId);
  if (index < 0) return false;
  const items = [...snapshot.items]; items[index] = { ...items[index], ...changes, updatedAt: new Date().toISOString() };
  await writePublicCatalogSnapshot(provider, items);
  return true;
}
