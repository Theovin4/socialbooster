import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase/admin";
import type { ProviderKey } from "./providers";

export const PUBLIC_CATALOG_SNAPSHOT_VERSION = 1;
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

export async function writePublicCatalogSnapshot(provider: ProviderKey, items: PublicCatalogSnapshotItem[]) {
  const db = adminDb();
  const manifestRef = db.collection("publicCatalogManifests").doc(provider);
  const previous = await manifestRef.get();
  const previousChunks = Number(previous.get("chunkCount") || 0);
  const chunkCount = Math.ceil(items.length / PUBLIC_CATALOG_SNAPSHOT_CHUNK_SIZE);
  const writer = db.bulkWriter();
  writer.onWriteError((error) => error.failedAttempts < 3);
  for (let index = 0; index < chunkCount; index += 1) {
    const chunk = items.slice(index * PUBLIC_CATALOG_SNAPSHOT_CHUNK_SIZE, (index + 1) * PUBLIC_CATALOG_SNAPSHOT_CHUNK_SIZE);
    writer.set(db.collection("publicCatalogChunks").doc(`${provider}_${String(index).padStart(4, "0")}`), { provider, version: PUBLIC_CATALOG_SNAPSHOT_VERSION, items: chunk, updatedAt: FieldValue.serverTimestamp() });
  }
  for (let index = chunkCount; index < previousChunks; index += 1) writer.delete(db.collection("publicCatalogChunks").doc(`${provider}_${String(index).padStart(4, "0")}`));
  writer.set(manifestRef, { provider, version: PUBLIC_CATALOG_SNAPSHOT_VERSION, chunkCount, serviceCount: items.length, updatedAt: FieldValue.serverTimestamp() });
  await writer.close();
  return { chunkCount, serviceCount: items.length };
}

/** Keeps an administrator's catalogue decision visible without rebuilding the
 * provider inventory. This bounded scan happens only for an admin action. */
export async function patchPublicCatalogSnapshotService(provider: ProviderKey, internalId: string, changes: Partial<Pick<PublicCatalogSnapshotItem, "active" | "featured" | "seoEligible" | "paidAdsEligible">>) {
  const db = adminDb();
  const manifest = await db.collection("publicCatalogManifests").doc(provider).get();
  if (!manifest.exists || manifest.get("version") !== PUBLIC_CATALOG_SNAPSHOT_VERSION) return false;
  const count = Number(manifest.get("chunkCount") || 0);
  const refs = Array.from({ length: count }, (_, index) => db.collection("publicCatalogChunks").doc(`${provider}_${String(index).padStart(4, "0")}`));
  const chunks = refs.length ? await db.getAll(...refs) : [];
  for (const chunk of chunks) {
    const items = (chunk.get("items") || []) as PublicCatalogSnapshotItem[];
    const index = items.findIndex((item) => item.internalId === internalId);
    if (index < 0) continue;
    items[index] = { ...items[index], ...changes };
    await chunk.ref.set({ items, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  }
  return false;
}
