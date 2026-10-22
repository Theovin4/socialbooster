import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase/admin";
import { providerDefinitions, providerServiceDocumentId, type ProviderKey } from "./providers";
import { readPublicCatalogSnapshot, type PublicCatalogSnapshotItem } from "./public-catalog-snapshot";
import { buildPublicServiceDetails, containsPrivateProviderLeak, type PublicServiceDetails } from "./service-description";
import { choosePreferredDuplicateServices, expandPublicServiceSemantics, type PublicServiceSemantics } from "./service-quality";

export const SERVICE_DESCRIPTION_BACKFILL_CONFIRMATION = "RESTORE_PUBLIC_SERVICE_DESCRIPTIONS";
type ProviderReport = { provider: ProviderKey; public: number; providerDescriptions: number; fallbacks: number; blank: number; creates: number; updates: number; unchanged: number; estimatedBytes: number; averageBytes: number; largestBytes: number; samplesAudited: number; qualityIssues: string[] };
export type ServiceDescriptionBackfillReport = { dryRun: boolean; providers: ProviderReport[]; detailDocuments: number; publicServices: number; providerDescriptions: number; fallbacks: number; blank: number; coveragePercent: number; creates: number; updates: number; unchanged: number; estimatedWrites: number; estimatedBytes: number; examples: Array<{ id: string; name: string; source: string; description: string }> };

function detailsInput(item: PublicCatalogSnapshotItem, raw: string) {
  return buildPublicServiceDetails({ serviceId: item.internalId, publicId: item.id, name: item.name, category: item.category, type: item.type, min: item.min, max: item.max, refill: item.refill, cancel: item.cancel, semantics: item.s ? expandPublicServiceSemantics(item.s) : { platform: item.category, kind: item.type }, providerDescription: raw });
}

function serializedBytes(value: unknown) { return Buffer.byteLength(JSON.stringify(value), "utf8"); }

export async function backfillPublicServiceDetails(input: { confirmation: string; dryRun: boolean; provider?: ProviderKey }): Promise<ServiceDescriptionBackfillReport> {
  if (input.confirmation !== SERVICE_DESCRIPTION_BACKFILL_CONFIRMATION) throw new Error("Explicit service-description restoration confirmation is required");
  const definitions = providerDefinitions().filter((item) => item.configured && (!input.provider || item.key === input.provider));
  if (!definitions.length) throw new Error("No requested provider is configured");
  const db = adminDb(), reports: ProviderReport[] = [], examples: ServiceDescriptionBackfillReport["examples"] = [];
  const exposureCandidates: Array<PublicCatalogSnapshotItem & { semantics: PublicServiceSemantics; details: PublicServiceDetails; provider: ProviderKey }> = [];

  for (const provider of definitions) {
    // This maintenance path intentionally calls services() only. It cannot place orders,
    // inspect balances, mutate wallets, process payments, or issue refunds.
    const [providerRows, snapshot] = await Promise.all([provider.client.services(), readPublicCatalogSnapshot(provider.key)]);
    if (!snapshot) throw new Error(`${provider.label} public catalogue snapshot is unavailable`);
    const rawById = new Map(providerRows.map((row) => [providerServiceDocumentId(provider.key, row.service), "description" in row ? String(row.description || "") : ""]));
    const publicItems = snapshot.items.filter((item) => item.active !== false);
    const desired = publicItems.map((item) => ({ item, details: detailsInput(item, rawById.get(item.internalId) || "") }));
    desired.forEach(({ item, details }) => exposureCandidates.push({ ...item, semantics: item.s ? expandPublicServiceSemantics(item.s) : { platform: item.category, kind: item.type }, details, provider: provider.key }));
    const existing = new Map<string, FirebaseFirestore.DocumentData>();
    for (let offset = 0; offset < desired.length; offset += 250) {
      const page = desired.slice(offset, offset + 250);
      const docs = await db.getAll(...page.map(({ item }) => db.collection("publicServiceDetails").doc(item.internalId)));
      docs.forEach((doc) => { if (doc.exists) existing.set(doc.id, doc.data()!); });
    }
    let creates = 0, updates = 0, unchanged = 0, estimatedBytes = 0, largestBytes = 0;
    const changed: Array<{ details: PublicServiceDetails }> = [];
    for (const entry of desired) {
      const old = existing.get(entry.item.internalId), bytes = serializedBytes(entry.details);
      estimatedBytes += bytes; largestBytes = Math.max(largestBytes, bytes);
      if (!old) { creates += 1; changed.push(entry); }
      else if (old.descriptionHash !== entry.details.descriptionHash || old.publicId !== entry.details.publicId) { updates += 1; changed.push(entry); }
      else unchanged += 1;
    }
    if (!input.dryRun && changed.length) {
      const writer = db.bulkWriter(); writer.onWriteError((error) => error.failedAttempts < 3);
      for (const { details } of changed) writer.set(db.collection("publicServiceDetails").doc(details.serviceId), { ...details, sourceUpdatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await writer.close();
    }
    const audit = desired.length <= 25 ? desired : Array.from({ length: 25 }, (_, index) => desired[Math.floor(index * desired.length / 25)]);
    const issues: string[] = [];
    for (const { item, details } of audit) {
      if (!details.fullDescription.trim()) issues.push(`${item.id}: blank`);
      if (containsPrivateProviderLeak(details.fullDescription)) issues.push(`${item.id}: private provider material`);
      if (/<[^>]+>|&amp;/i.test(details.fullDescription)) issues.push(`${item.id}: HTML/entity leakage`);
      if (details.fullDescription.length > 5_000) issues.push(`${item.id}: over 5000 characters`);
    }
    desired.slice(0, 4).forEach(({ item, details }) => { if (examples.length < 12) examples.push({ id: item.id, name: item.name, source: details.descriptionSource, description: details.fullDescription.slice(0, 500) }); });
    const providerDescriptions = desired.filter(({ details }) => details.descriptionSource === "provider").length;
    const fallbacks = desired.length - providerDescriptions, blank = desired.filter(({ details }) => !details.fullDescription.trim()).length;
    reports.push({ provider: provider.key, public: desired.length, providerDescriptions, fallbacks, blank, creates, updates, unchanged, estimatedBytes, averageBytes: desired.length ? Math.round(estimatedBytes / desired.length) : 0, largestBytes, samplesAudited: audit.length, qualityIssues: issues });
  }
  const sum = (key: keyof ProviderReport) => reports.reduce((total, report) => total + Number(report[key] || 0), 0);
  const exposed = choosePreferredDuplicateServices(exposureCandidates), detailDocuments = sum("public"), publicServices = exposed.length;
  const providerDescriptions = exposed.filter((item) => item.details.descriptionSource === "provider").length, fallbacks = exposed.filter((item) => item.details.descriptionSource === "generated_fallback").length, blank = exposed.filter((item) => !item.details.fullDescription.trim()).length;
  const creates = sum("creates"), updates = sum("updates"), unchanged = sum("unchanged"), estimatedBytes = sum("estimatedBytes");
  return { dryRun: input.dryRun, providers: reports, detailDocuments, publicServices, providerDescriptions, fallbacks, blank, coveragePercent: publicServices ? Number((((publicServices - blank) / publicServices) * 100).toFixed(2)) : 0, creates, updates, unchanged, estimatedWrites: creates + updates, estimatedBytes, examples };
}
