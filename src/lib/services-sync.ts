import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./firebase/admin";
import { configuredUsdToNgnRateMicros, convertMinor } from "./currency";
import { DEFAULT_GROSS_MARGIN_BPS, decimalToMinor, grossMarginBps, markupBps, sellingPriceForGrossMarginMinor } from "./money";
import { providerDefinitions, providerServiceDocumentId, type ProviderDefinition, type ProviderKey } from "./providers";
import { choosePreferredDuplicateServices, compactPublicServiceSemantics, evaluateServiceQuality, sanitizePublicCatalogCandidate, type PublicServiceSemantics } from "./service-quality";
import { publicServiceId } from "./service-public-id";
import { PUBLIC_CATALOG_SNAPSHOT_CHUNK_SIZE, PUBLIC_CATALOG_SNAPSHOT_VERSION, readPublicCatalogSnapshot, writePublicCatalogSnapshot, type PublicCatalogSnapshotItem } from "./public-catalog-snapshot";
import { buildPublicServiceDetails } from "./service-description";

const FINGERPRINT_VERSION = 1;
const QUALITY_RULESET_VERSION = 4;
const FINGERPRINT_CHUNK_SIZE = 500;
const MANUAL_SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const SYNC_LOCK_MS = 10 * 60 * 1000;

export type ProviderFingerprint = { id: string; fingerprint: string };
export type ProviderFingerprintDiff = { added: string[]; changed: string[]; removed: string[]; unchanged: number };
export type SyncTrigger = "scheduled" | "manual";

export function providerCatalogueHash(entries: ProviderFingerprint[]) {
  return createHash("sha256").update(JSON.stringify([...entries].sort((a, b) => a.id.localeCompare(b.id)))).digest("hex");
}

export function diffProviderFingerprints(previous: ProviderFingerprint[], current: ProviderFingerprint[]): ProviderFingerprintDiff {
  const before = new Map(previous.map((entry) => [entry.id, entry.fingerprint]));
  const after = new Map(current.map((entry) => [entry.id, entry.fingerprint]));
  const added: string[] = [], changed: string[] = [], removed: string[] = [];
  let unchanged = 0;
  for (const [id, fingerprint] of after) {
    if (!before.has(id)) added.push(id);
    else if (before.get(id) !== fingerprint) changed.push(id);
    else unchanged += 1;
  }
  for (const id of before.keys()) if (!after.has(id)) removed.push(id);
  return { added, changed, removed, unchanged };
}

export function manualSyncRejection(state: Record<string, unknown>, now: number, trigger: SyncTrigger) {
  const lockExpiry = (state.lockExpiresAt as { toMillis?: () => number } | undefined)?.toMillis?.() || 0;
  if (state.syncInProgress === true && lockExpiry > now) return "A synchronization is already in progress";
  const lastManual = (state.lastManualSyncAt as { toMillis?: () => number } | undefined)?.toMillis?.() || 0;
  if (trigger === "manual" && now - lastManual < MANUAL_SYNC_COOLDOWN_MS) return "Please wait five minutes before starting another manual synchronization";
  return null;
}

export function removedServiceState() {
  return { active: false, publicEligibility: "hidden", hiddenReasons: ["removed_from_provider_catalog"] } as const;
}

function hashRecord(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function combinedPublicCatalogHash(providerSnapshotHashes: Record<string, string | null>, providerCounts: Record<string, number>, publicEligibleCount: number) {
  return hashRecord({
    providerSnapshotHashes: Object.fromEntries(Object.entries(providerSnapshotHashes).sort(([left], [right]) => left.localeCompare(right))),
    providerCounts: Object.fromEntries(Object.entries(providerCounts).sort(([left], [right]) => left.localeCompare(right))),
    publicEligibleCount,
  });
}

export async function refreshPublicCatalogManifest(successfulProviders?: number) {
  const providers = providerDefinitions().filter((provider) => provider.configured);
  const snapshots = await Promise.all(providers.map((provider) => readPublicCatalogSnapshot(provider.key)));
  const eligibleByProvider = snapshots.map((snapshot) => (snapshot?.items || [])
    .map(sanitizePublicCatalogCandidate)
    .filter((item): item is PublicCatalogSnapshotItem & { semantics: PublicServiceSemantics } => item !== null && item.active !== false));
  const activePublicServices = choosePreferredDuplicateServices(eligibleByProvider.flat());
  const providerCounts = Object.fromEntries(providers.map((provider, index) => [provider.key, eligibleByProvider[index].length]));
  const providerSnapshotHashes = Object.fromEntries(providers.map((provider, index) => [provider.key, snapshots[index]?.hash || null]));
  const combinedPublicHash = combinedPublicCatalogHash(providerSnapshotHashes, providerCounts, activePublicServices.length);
  await adminDb().collection("publicCatalogStats").doc("current").set({
    publicEligibleCount: activePublicServices.length,
    providerCount: providers.length,
    providerCounts,
    successfulProviders: successfulProviders ?? providers.length,
    providerSnapshotHashes,
    snapshotHashes: providerSnapshotHashes,
    combinedPublicHash,
    qualityState: "EXACT_CACHED",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { publicEligibleCount: activePublicServices.length, providerCounts, providerSnapshotHashes, combinedPublicHash };
}

async function acquireSyncLock(provider: ProviderKey, trigger: SyncTrigger) {
  const db = adminDb(), ref = db.collection("providerSyncState").doc(provider), token = randomUUID(), now = Date.now();
  const state = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const rejection = manualSyncRejection(snapshot.data() || {}, now, trigger);
    if (rejection) throw new Error(rejection);
    transaction.set(ref, {
      syncInProgress: true,
      lockToken: token,
      lockExpiresAt: Timestamp.fromMillis(now + SYNC_LOCK_MS),
      status: "running",
      startedAt: FieldValue.serverTimestamp(),
      ...(trigger === "manual" ? { lastManualSyncAt: FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
    return snapshot.data() || {};
  });
  return { ref, token, state };
}

async function finishSync(ref: FirebaseFirestore.DocumentReference, token: string, values: FirebaseFirestore.DocumentData) {
  const db = adminDb();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.get("lockToken") !== token) return false;
    transaction.set(ref, { ...values, syncInProgress: false, lockToken: FieldValue.delete(), lockExpiresAt: FieldValue.delete(), completedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
}

function fingerprintSlotMetadata(state: FirebaseFirestore.DocumentData, slot: "a" | "b") {
  const slots = (state.fingerprintSlots || {}) as Record<string, unknown>, raw = slots[slot];
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>, chunkCount = Number(value.chunkCount), hash = String(value.hash || "");
  return Number.isSafeInteger(chunkCount) && chunkCount >= 0 && /^[a-f0-9]{64}$/.test(hash) ? { chunkCount, hash } : null;
}

async function readFingerprintSnapshot(provider: ProviderKey, state: FirebaseFirestore.DocumentData): Promise<ProviderFingerprint[] | null> {
  if (state.fingerprintVersion !== FINGERPRINT_VERSION) return null;
  const slot: "a" | "b" = state.activeFingerprintSlot === "b" ? "b" : "a", metadata = fingerprintSlotMetadata(state, slot);
  if (!metadata) return null;
  const db = adminDb(), refs = Array.from({ length: metadata.chunkCount }, (_, index) => db.collection("providerFingerprintChunks").doc(`${provider}_${slot}_${String(index).padStart(4, "0")}`));
  const chunks = refs.length ? await db.getAll(...refs) : [];
  if (chunks.some((chunk) => !chunk.exists || chunk.get("snapshotHash") !== metadata.hash || chunk.get("version") !== FINGERPRINT_VERSION)) return null;
  const entries = chunks.flatMap((chunk) => (chunk.get("entries") || []) as ProviderFingerprint[]);
  return providerCatalogueHash(entries) === metadata.hash ? entries : null;
}

async function writeFingerprintSnapshot(provider: ProviderKey, state: FirebaseFirestore.DocumentData, entries: ProviderFingerprint[], hash: string) {
  const db = adminDb(), current: "a" | "b" = state.activeFingerprintSlot === "b" ? "b" : "a";
  const next: "a" | "b" = state.fingerprintVersion === FINGERPRINT_VERSION && current === "a" ? "b" : "a";
  const chunkCount = Math.ceil(entries.length / FINGERPRINT_CHUNK_SIZE), writer = db.bulkWriter();
  writer.onWriteError((error) => error.failedAttempts < 3);
  for (let index = 0; index < chunkCount; index += 1) {
    writer.set(db.collection("providerFingerprintChunks").doc(`${provider}_${next}_${String(index).padStart(4, "0")}`), {
      provider, slot: next, version: FINGERPRINT_VERSION, snapshotHash: hash,
      entries: entries.slice(index * FINGERPRINT_CHUNK_SIZE, (index + 1) * FINGERPRINT_CHUNK_SIZE),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await writer.close();
  return { slot: next, chunkCount, slots: { ...((state.fingerprintSlots || {}) as object), [next]: { chunkCount, hash } } };
}

async function recordSyncRun(provider: ProviderKey, startedAt: number, data: Record<string, unknown>) {
  const slot = Math.floor(startedAt / 3_600_000) % 30;
  const db = adminDb(), reads = Number(data.firestoreReads || data.manifestReads || 0), writes = Number(data.firestoreWrites || 0);
  await Promise.all([
    db.collection("providerSyncRuns").doc(`${provider}_${String(slot).padStart(2, "0")}`).set({ provider, startedAt: Timestamp.fromMillis(startedAt), completedAt: FieldValue.serverTimestamp(), durationMs: Date.now() - startedAt, ...data }),
    db.collection("operationsAlerts").doc(`provider_sync_${provider}`).set({
      type: "provider_sync_budget", provider, active: reads >= 10_000 || writes >= 10_000 || data.status === "failed",
      severity: reads >= 20_000 || writes >= 20_000 || data.status === "failed" ? "critical" : reads >= 10_000 || writes >= 10_000 ? "warning" : "healthy",
      firestoreReads: reads, firestoreWrites: writes, lastCheckedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
  ]).catch(() => undefined);
}

async function getChangedDocuments(ids: string[]) {
  const db = adminDb(), providers = new Map<string, FirebaseFirestore.DocumentData>(), services = new Map<string, FirebaseFirestore.DocumentData>(), details = new Map<string, FirebaseFirestore.DocumentData>();
  for (let offset = 0; offset < ids.length; offset += 200) {
    const page = ids.slice(offset, offset + 200);
    const providerDocs = await db.getAll(...page.map((id) => db.collection("providerServices").doc(id)));
    const serviceDocs = await db.getAll(...page.map((id) => db.collection("services").doc(id)));
    const detailDocs = await db.getAll(...page.map((id) => db.collection("publicServiceDetails").doc(id)));
    providerDocs.forEach((doc) => { if (doc.exists) providers.set(doc.id, doc.data()!); });
    serviceDocs.forEach((doc) => { if (doc.exists) services.set(doc.id, doc.data()!); });
    detailDocs.forEach((doc) => { if (doc.exists) details.set(doc.id, doc.data()!); });
  }
  return { providers, services, details };
}

export async function synchronizeProviderServices(providerKey: ProviderDefinition["key"], options: { trigger?: SyncTrigger } = {}) {
  const trigger = options.trigger || "scheduled";
  const provider = providerDefinitions().find((item) => item.key === providerKey);
  if (!provider?.configured) throw new Error(`${provider?.label || providerKey} is not configured`);
  const startedAt = Date.now(), lock = await acquireSyncLock(provider.key, trigger);
  try {
    const [rows, balance] = await Promise.all([provider.client.services(), provider.client.balance()]);
    if (rows.length > 20_000) console.warn("[services:sync] unusually large catalogue", { provider: providerKey, serviceCount: rows.length });
    const reportedCurrency = String(balance.currency || provider.currency).trim().toUpperCase();
    if (reportedCurrency !== "NGN" && reportedCurrency !== "USD") throw new Error(`${provider.label} returned an unsupported account currency`);
    const providerCurrency: "NGN" | "USD" = reportedCurrency;
    const providerBalance = Number.parseFloat(String(balance.balance));
    if (!Number.isFinite(providerBalance) || providerBalance < 0) throw new Error(`${provider.label} returned an invalid account balance`);
    const providerFunded = providerBalance > 0, grossMarginTargetBps = DEFAULT_GROSS_MARGIN_BPS, usdToNgn = configuredUsdToNgnRateMicros();
    const normalized = rows.map((item) => {
      const id = providerServiceDocumentId(provider.key, item.service), nativeRateMinor = decimalToMinor(item.rate);
      const providerRateNgnMinor = providerCurrency === "USD" ? convertMinor(nativeRateMinor, usdToNgn) : nativeRateMinor;
      const providerData = { providerKey: provider.key, providerLabel: provider.label, providerServiceId: item.service, name: item.name, description: "description" in item ? item.description || "" : "", categoryName: item.category, type: item.type, rateText: item.rate, providerNativeRateMinor: Number(nativeRateMinor), providerRateNgnMinor: Number(providerRateNgnMinor), minQuantity: item.min, maxQuantity: item.max, refillSupported: item.refill, cancelSupported: item.cancel, isActive: true, providerCurrency };
      const fingerprint = hashRecord({ ...providerData, providerFunded, grossMarginTargetBps: Number(grossMarginTargetBps), usdToNgn: String(usdToNgn) });
      return { id, item, providerData, providerRateNgnMinor, nativeRateMinor, fingerprint };
    });
    const qualityById = new Map(normalized.map((row) => {
      const sellingRateMinor = sellingPriceForGrossMarginMinor(row.providerRateNgnMinor, grossMarginTargetBps);
      return [row.id, evaluateServiceQuality({ name: row.item.name, category: row.item.category, description: "description" in row.item ? row.item.description || "" : "", min: row.item.min, max: row.item.max, rateMinor: row.providerRateNgnMinor, sellingRateMinor, providerFunded, type: row.item.type, refill: row.item.refill, cancel: row.item.cancel })] as const;
    }));
    const duplicateCounts = new Map<string, number>();
    for (const quality of qualityById.values()) duplicateCounts.set(quality.duplicateGroupKey, (duplicateCounts.get(quality.duplicateGroupKey) || 0) + 1);
    const qualitySummary = {
      publicEligible: [...qualityById.values()].filter((quality) => quality.publicEligible).length,
      hiddenAnomalies: [...qualityById.values()].filter((quality) => quality.priceStatus !== "NORMAL").length,
      nonServiceRecords: [...qualityById.values()].filter((quality) => quality.reasonCodes.includes("NON_SERVICE_RECORD")).length,
      unmappedCategories: [...qualityById.values()].filter((quality) => quality.reasonCodes.includes("UNMAPPED_CATEGORY")).length,
      complianceHidden: [...qualityById.values()].filter((quality) => quality.complianceStatus !== "APPROVED").length,
      malformedNames: [...qualityById.values()].filter((quality) => quality.reasonCodes.includes("MALFORMED_NAME") || quality.reasonCodes.includes("INVALID_SERVICE_NAME") || quality.reasonCodes.includes("INSTRUCTION_ROW")).length,
      providerLabelsRemoved: rows.filter((item) => /\b(?:followspanel|follows\s*panel|nitro\s*(?:ng)?|smm\s*world)\b/i.test(item.name)).length,
      duplicateGroups: [...duplicateCounts.values()].filter((count) => count > 1).length,
    };
    const fingerprints = normalized.map(({ id, fingerprint }) => ({ id, fingerprint })), catalogueHash = providerCatalogueHash(fingerprints);
    if (lock.state.catalogueHash === catalogueHash && lock.state.fingerprintVersion === FINGERPRINT_VERSION && lock.state.qualityRulesetVersion === QUALITY_RULESET_VERSION && lock.state.publicCatalogSnapshotVersion === PUBLIC_CATALOG_SNAPSHOT_VERSION) {
      const result = { provider: provider.key, providerCurrency, providerBalance: balance.balance, providerFunded, serviceCount: rows.length, publicServiceCount: Number(lock.state.publicServiceCount || 0), qualitySummary, publicCatalogueChanged: false, detailChangedIds: [] as string[], changedCount: 0, repricedCount: 0, unchangedCount: rows.length, shortCircuited: true, durationMs: Date.now() - startedAt };
      const metrics = { providerRowsReturned: rows.length, firestoreReads: 2, firestoreRecordsCompared: 0, newRecords: 0, changedRecords: 0, removedRecords: 0, unchangedRecords: rows.length, firestoreWrites: 4, publicSnapshotChanged: false, fallbackActivated: false, shortCircuited: true };
      await finishSync(lock.ref, lock.token, { ...result, status: "completed", lastMetrics: metrics, lastHeartbeatAt: FieldValue.serverTimestamp() });
      await recordSyncRun(provider.key, startedAt, metrics);
      return result;
    }

    const qualityMigration = lock.state.qualityRulesetVersion !== QUALITY_RULESET_VERSION;
    const publicSnapshotMigration = lock.state.publicCatalogSnapshotVersion !== PUBLIC_CATALOG_SNAPSHOT_VERSION;
    const previousFingerprints = await readFingerprintSnapshot(provider.key, lock.state);
    const legacyBaseline = !previousFingerprints && (lock.state.completedAt || Number(lock.state.serviceCount || 0) > 0);
    const diff = previousFingerprints ? diffProviderFingerprints(previousFingerprints, fingerprints) : legacyBaseline ? { added: [], changed: [], removed: [], unchanged: rows.length } : { added: fingerprints.map((entry) => entry.id), changed: [], removed: [], unchanged: 0 };
    const changedIds = [...diff.added, ...diff.changed], existing = await getChangedDocuments(changedIds);
    const previousPublic = await readPublicCatalogSnapshot(provider.key);
    const previousPublicMap = new Map((previousPublic?.items || []).map((item) => [item.internalId, item]));
    const publicMap = new Map(previousPublicMap);
    const rowMap = new Map(normalized.map((row) => [row.id, row]));
    const db = adminDb(), writer = db.bulkWriter(); writer.onWriteError((error) => error.failedAttempts < 3);
    let serviceWrites = 0;
    const detailChangedIds: string[] = [];

    const publicItemFor = (row: typeof normalized[number], stored?: FirebaseFirestore.DocumentData): PublicCatalogSnapshotItem | null => {
      const sellingRateMinor = sellingPriceForGrossMarginMinor(row.providerRateNgnMinor, grossMarginTargetBps);
      const quality = qualityById.get(row.id)!;
      const old = previousPublicMap.get(row.id), visibilityOverride = stored?.visibilityOverride === "show" || stored?.visibilityOverride === "hide" ? stored.visibilityOverride : null;
      const active = quality.publicEligible && visibilityOverride !== "hide" && (visibilityOverride === "show" || old?.active !== false);
      if (!quality.publicEligible) return null;
      const name = typeof stored?.publicNameOverride === "string" && stored.publicNameOverride.trim()
        ? stored.publicNameOverride.trim().slice(0, 140)
        : quality.publicName;
      return { id: publicServiceId(row.id), internalId: row.id, name, category: quality.normalizedCategory, type: row.item.type, min: row.item.min, max: row.item.max, refill: row.item.refill, cancel: row.item.cancel, rateMinor: Number(sellingRateMinor), updatedAt: new Date().toISOString(), seoEligible: quality.publicEligible && (stored?.seoEligibilityOverride === "index" || old?.seoEligible === true), featured: quality.publicEligible && (stored?.featured === true || old?.featured === true), paidAdsEligible: quality.publicEligible && (stored?.paidAdsEligible === true || old?.paidAdsEligible === true), active, s: compactPublicServiceSemantics(quality.semantics) };
    };

    if (legacyBaseline || qualityMigration || publicSnapshotMigration) {
      // Bootstrap compact state from the already synchronized catalogue without
      // reading or rewriting all service documents.
      publicMap.clear();
      for (const row of normalized) {
        const item = publicItemFor(row);
        if (item) publicMap.set(row.id, item); else publicMap.delete(row.id);
      }
    } else {
      for (const id of changedIds) {
        const row = rowMap.get(id); if (!row) continue;
        const stored = existing.services.get(id), sellingRateMinor = sellingPriceForGrossMarginMinor(row.providerRateNgnMinor, grossMarginTargetBps);
        const quality = qualityById.get(id)!;
        const visibilityOverride = stored?.visibilityOverride === "show" || stored?.visibilityOverride === "hide" ? stored.visibilityOverride : null;
        const active = quality.publicEligible && visibilityOverride !== "hide";
        const publicName = typeof stored?.publicNameOverride === "string" && stored.publicNameOverride.trim() ? stored.publicNameOverride.trim().slice(0, 140) : quality.publicName;
        const customerData = { ...row.providerData, rawName: row.item.name, rawCategoryName: row.item.category, rawDescription: "description" in row.item ? row.item.description || "" : "", publicName, publicSemantics: quality.semantics, categoryName: quality.normalizedCategory, publicStatus: active ? "published" : quality.complianceStatus === "REVIEW_REQUIRED" || quality.priceStatus === "PRICE_REVIEW" ? "review" : "hidden", publicEligibility: quality.publicEligible ? "eligible" : "hidden", reasonCodes: quality.reasonCodes, hiddenReasons: quality.hiddenReasons, priceStatus: quality.priceStatus, complianceStatus: quality.complianceStatus, duplicateGroupKey: quality.duplicateGroupKey, featured: quality.publicEligible && stored?.featured === true, flaggedForReview: quality.complianceStatus === "REVIEW_REQUIRED" || quality.priceStatus === "PRICE_REVIEW" || stored?.flaggedForReview === true, paidAdsEligible: quality.publicEligible && stored?.paidAdsEligible === true, seoEligible: quality.publicEligible && stored?.seoEligibilityOverride === "index" };
        const pricingFingerprint = hashRecord({ ...customerData, providerRateNgnMinor: String(row.providerRateNgnMinor), grossMarginTargetBps: Number(grossMarginTargetBps), active });
        writer.set(db.collection("providerServices").doc(id), { ...row.providerData, syncFingerprint: row.fingerprint, lastSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
        writer.set(db.collection("services").doc(id), { ...customerData, providerNativeRateMinor: Number(row.nativeRateMinor), providerRateMinor: Number(row.providerRateNgnMinor), providerRateNgnMinor: Number(row.providerRateNgnMinor), sellingCurrency: "NGN", sellingRateMinor: Number(sellingRateMinor), pricingModel: "ngn_gross_margin_v2", pricingFingerprint, grossMarginTargetBps: Number(grossMarginTargetBps), grossMarginBps: Number(grossMarginBps(row.providerRateNgnMinor, sellingRateMinor)), markupBps: Number(markupBps(row.providerRateNgnMinor, sellingRateMinor)), active, autoImported: true, customSellingRateMinor: FieldValue.delete(), marginBps: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(), ...(stored ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
        serviceWrites += 2;
        const publicItem = publicItemFor(row, stored);
        if (publicItem) {
          publicMap.set(id, publicItem);
          const details = buildPublicServiceDetails({ serviceId: id, publicId: publicItem.id, name: publicItem.name, category: publicItem.category, type: publicItem.type, min: publicItem.min, max: publicItem.max, refill: publicItem.refill, cancel: publicItem.cancel, semantics: quality.semantics, providerDescription: "description" in row.item ? row.item.description || "" : "" });
          if (existing.details.get(id)?.descriptionHash !== details.descriptionHash || existing.details.get(id)?.publicId !== details.publicId) {
            writer.set(db.collection("publicServiceDetails").doc(id), { ...details, sourceUpdatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            detailChangedIds.push(id); serviceWrites += 1;
          }
        } else publicMap.delete(id);
      }
      for (const id of diff.removed) {
        writer.set(db.collection("services").doc(id), { ...removedServiceState(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        writer.set(db.collection("providerServices").doc(id), { isActive: false, lastSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
        publicMap.delete(id); serviceWrites += 2;
      }
    }
    await writer.close();
    const publicSnapshot = await writePublicCatalogSnapshot(provider.key, [...publicMap.values()]);
    const fingerprintSnapshot = await writeFingerprintSnapshot(provider.key, lock.state, fingerprints, catalogueHash);
    const result = { provider: provider.key, providerCurrency, providerBalance: balance.balance, providerFunded, serviceCount: rows.length, publicServiceCount: publicMap.size, qualitySummary, publicCatalogSnapshot: publicSnapshot, publicCatalogueChanged: publicSnapshot.changed, detailChangedIds, changedCount: changedIds.length + diff.removed.length, repricedCount: changedIds.length, unchangedCount: diff.unchanged, shortCircuited: false, baselineInitialized: legacyBaseline, durationMs: Date.now() - startedAt };
    const fingerprintChunkReads = Math.ceil((previousFingerprints?.length || 0) / FINGERPRINT_CHUNK_SIZE);
    const publicSnapshotReads = 1 + Math.ceil((previousPublic?.items.length || 0) / PUBLIC_CATALOG_SNAPSHOT_CHUNK_SIZE);
    const metrics = { providerRowsReturned: rows.length, firestoreReads: 4 + fingerprintChunkReads + publicSnapshotReads + changedIds.length * 3, firestoreRecordsCompared: previousFingerprints?.length || 0, newRecords: diff.added.length, changedRecords: diff.changed.length, removedRecords: diff.removed.length, unchangedRecords: diff.unchanged, firestoreWrites: serviceWrites + fingerprintSnapshot.chunkCount + (publicSnapshot.changed ? publicSnapshot.chunkCount + 1 : 0) + 4, publicSnapshotChanged: publicSnapshot.changed, detailWrites: detailChangedIds.length, fallbackActivated: previousPublic?.fallbackUsed === true, shortCircuited: false, baselineInitialized: legacyBaseline };
    await finishSync(lock.ref, lock.token, { ...result, status: "completed", catalogueHash, fingerprintVersion: FINGERPRINT_VERSION, qualityRulesetVersion: QUALITY_RULESET_VERSION, publicCatalogSnapshotVersion: PUBLIC_CATALOG_SNAPSHOT_VERSION, activeFingerprintSlot: fingerprintSnapshot.slot, fingerprintChunkCount: fingerprintSnapshot.chunkCount, fingerprintSlots: fingerprintSnapshot.slots, publicCatalogueHash: publicSnapshot.hash, lastMetrics: metrics, lastHeartbeatAt: FieldValue.serverTimestamp() });
    await recordSyncRun(provider.key, startedAt, metrics);
    console.info("[services:sync] completed", result);
    return result;
  } catch (error) {
    await finishSync(lock.ref, lock.token, { status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "Unknown synchronization error" }).catch(() => undefined);
    await recordSyncRun(provider.key, startedAt, { status: "failed", error: error instanceof Error ? error.message.slice(0, 300) : "Unknown error" });
    throw error;
  }
}

export async function synchronizeAllProviderServices() {
  const providers = providerDefinitions().filter((provider) => provider.configured);
  if (!providers.length) throw new Error("No order provider is configured");
  const settled = await Promise.allSettled(providers.map((provider) => synchronizeProviderServices(provider.key, { trigger: "scheduled" })));
  const results = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
  const failures = settled.flatMap((item, index) => item.status === "rejected" ? [{ provider: providers[index].key, error: item.reason instanceof Error ? item.reason.message : String(item.reason) }] : []);
  failures.forEach((failure) => console.error("[services:sync] provider failed", failure));
  if (!results.length) throw new Error("Every configured provider failed to synchronize");
  const publicCatalogueChanged = results.some((result) => result.publicCatalogueChanged);
  if (publicCatalogueChanged) await refreshPublicCatalogManifest(results.length);
  return { providerCount: providers.length, successfulProviders: results.length, failedProviders: failures.length, serviceCount: results.reduce((sum, item) => sum + item.serviceCount, 0), publicCatalogueChanged, detailChangedIds: results.flatMap((item) => item.detailChangedIds), changedCount: results.reduce((sum, item) => sum + item.changedCount, 0), repricedCount: results.reduce((sum, item) => sum + item.repricedCount, 0), providers: results, failures };
}
