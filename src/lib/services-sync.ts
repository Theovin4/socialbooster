import { createHash } from "node:crypto";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase/admin";
import { configuredUsdToNgnRateMicros, convertMinor } from "./currency";
import { DEFAULT_GROSS_MARGIN_BPS, decimalToMinor, grossMarginBps, markupBps, sellingPriceForGrossMarginMinor } from "./money";
import { providerDefinitions, providerServiceDocumentId, type ProviderDefinition } from "./providers";
import { evaluateServiceQuality } from "./service-quality";

export async function synchronizeProviderServices(providerKey: ProviderDefinition["key"]) {
  const provider = providerDefinitions().find((item) => item.key === providerKey);
  if (!provider?.configured) throw new Error(`${provider?.label || providerKey} is not configured`);
  const startedAt = Date.now();
  const [rows, balance] = await Promise.all([provider.client.services(), provider.client.balance()]);
  const reportedCurrency = String(balance.currency || provider.currency).trim().toUpperCase();
  if (reportedCurrency !== "NGN" && reportedCurrency !== "USD") throw new Error(`${provider.label} returned an unsupported account currency`);
  const providerCurrency: "NGN" | "USD" = reportedCurrency;
  const providerBalance = Number.parseFloat(String(balance.balance));
  if (!Number.isFinite(providerBalance) || providerBalance < 0) throw new Error(`${provider.label} returned an invalid account balance`);
  const providerFunded = providerBalance > 0;
  const db = adminDb();
  const providerCatalogue = db.collection("providerServices");
  const customerCatalogue = db.collection("services");
  const providerQuery = providerCatalogue.where("providerKey", "==", provider.key);
  const serviceQuery = customerCatalogue.where("providerKey", "==", provider.key);
  const syncStateRef = db.collection("providerSyncState").doc(provider.key);
  const syncState = await syncStateRef.get();
  const migrateLegacyNumericServices = provider.key === "followspanel" && syncState.get("legacyNumericMigrationVersion") !== 1;
  const [providerSnapshot, serviceSnapshot, legacyProviderSnapshot, legacyServiceSnapshot] = await Promise.all([
    providerQuery.get(),
    serviceQuery.get(),
    migrateLegacyNumericServices ? providerCatalogue.where(FieldPath.documentId(), ">=", "0").where(FieldPath.documentId(), "<=", `9\uf8ff`).get() : null,
    migrateLegacyNumericServices ? customerCatalogue.where(FieldPath.documentId(), ">=", "0").where(FieldPath.documentId(), "<=", `9\uf8ff`).get() : null,
  ]);
  const providers = new Map([...providerSnapshot.docs, ...(legacyProviderSnapshot?.docs || [])].map((doc) => [doc.id, doc.data()]));
  const services = new Map([...serviceSnapshot.docs, ...(legacyServiceSnapshot?.docs || [])].map((doc) => [doc.id, doc.data()]));
  const writer = db.bulkWriter();
  writer.onWriteError((error) => error.failedAttempts < 3);
  const grossMarginTargetBps = DEFAULT_GROSS_MARGIN_BPS, usdToNgn = configuredUsdToNgnRateMicros();
  let changed = 0, repriced = 0;
  const incomingIds = new Set<string>();

  for (const item of rows) {
    const id = providerServiceDocumentId(provider.key, item.service);
    incomingIds.add(id);
    const nativeRateMinor = decimalToMinor(item.rate);
    const providerRateNgnMinor = providerCurrency === "USD" ? convertMinor(nativeRateMinor, usdToNgn) : nativeRateMinor;
    const sellingRateMinor = sellingPriceForGrossMarginMinor(providerRateNgnMinor, grossMarginTargetBps);
    const providerData = { providerKey: provider.key, providerLabel: provider.label, providerServiceId: item.service, name: item.name, description: "description" in item ? item.description || "" : "", categoryName: item.category, type: item.type, rateText: item.rate, providerNativeRateMinor: Number(nativeRateMinor), providerRateNgnMinor: Number(providerRateNgnMinor), minQuantity: item.min, maxQuantity: item.max, refillSupported: item.refill, cancelSupported: item.cancel, isActive: true, providerCurrency };
    const syncFingerprint = createHash("sha256").update(JSON.stringify(providerData)).digest("hex");
    if (providers.get(id)?.syncFingerprint !== syncFingerprint) {
      writer.set(db.collection("providerServices").doc(id), { ...providerData, syncFingerprint, lastSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
      changed += 1;
    }
    const existing = services.get(id);
    const quality = evaluateServiceQuality({ name: item.name, category: item.category, min: item.min, max: item.max, rateMinor: providerRateNgnMinor, providerFunded });
    const visibilityOverride = existing?.visibilityOverride === "show" || existing?.visibilityOverride === "hide" ? existing.visibilityOverride : null;
    const active = visibilityOverride === "show" ? providerFunded : visibilityOverride === "hide" ? false : quality.publicEligible;
    const customerData = { ...providerData, categoryName: quality.normalizedCategory, publicEligibility: quality.publicEligible ? "eligible" : "hidden", hiddenReasons: quality.hiddenReasons };
    const pricingFingerprint = createHash("sha256").update(JSON.stringify({ ...customerData, providerRateNgnMinor: String(providerRateNgnMinor), grossMarginTargetBps: Number(grossMarginTargetBps), active })).digest("hex");
    // Backup catalogues are safe to synchronize while unfunded, but their
    // services must not accept customer orders until the account has funds.
    // A later funded synchronization automatically re-enables them.
    if (existing?.pricingFingerprint === pricingFingerprint && existing?.pricingModel === "ngn_gross_margin_v2" && existing?.active === active) continue;
    writer.set(db.collection("services").doc(id), { ...customerData, providerNativeRateMinor: Number(nativeRateMinor), providerRateMinor: Number(providerRateNgnMinor), providerRateNgnMinor: Number(providerRateNgnMinor), sellingCurrency: "NGN", sellingRateMinor: Number(sellingRateMinor), pricingModel: "ngn_gross_margin_v2", pricingFingerprint, grossMarginTargetBps: Number(grossMarginTargetBps), grossMarginBps: Number(grossMarginBps(providerRateNgnMinor, sellingRateMinor)), markupBps: Number(markupBps(providerRateNgnMinor, sellingRateMinor)), active, autoImported: true, customSellingRateMinor: FieldValue.delete(), marginBps: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(), ...(existing ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
    changed += 1; repriced += 1;
  }

  // Anything removed from a provider catalogue must stop accepting new orders.
  // The document remains available for historical orders and administrative audit.
  for (const [id, existing] of services) {
    if (incomingIds.has(id) || existing.active === false) continue;
    writer.set(customerCatalogue.doc(id), { active: false, publicEligibility: "hidden", hiddenReasons: ["removed_from_provider_catalog"], updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    changed += 1;
  }
  for (const [id, existing] of providers) {
    if (incomingIds.has(id) || existing.isActive === false) continue;
    writer.set(providerCatalogue.doc(id), { isActive: false, lastSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
    changed += 1;
  }
  await writer.close();
  const result = { provider: provider.key, providerCurrency, providerBalance: balance.balance, providerFunded, serviceCount: rows.length, changedCount: changed, repricedCount: repriced, durationMs: Date.now() - startedAt };
  await syncStateRef.set({ ...result, status: "completed", ...(migrateLegacyNumericServices ? { legacyNumericMigrationVersion: 1 } : {}), completedAt: FieldValue.serverTimestamp() }, { merge: true });
  console.info("[services:sync] completed", result);
  return result;
}

export async function synchronizeAllProviderServices() {
  const providers = providerDefinitions().filter((provider) => provider.configured);
  if (!providers.length) throw new Error("No order provider is configured");
  const settled = await Promise.allSettled(providers.map((provider) => synchronizeProviderServices(provider.key)));
  const results = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
  const failures = settled.flatMap((item, index) => item.status === "rejected" ? [{ provider: providers[index].key, error: item.reason instanceof Error ? item.reason.message : String(item.reason) }] : []);
  for (const failure of failures) {
    console.error("[services:sync] provider failed", failure);
    await adminDb().collection("providerSyncState").doc(failure.provider).set({ status: "failed", error: failure.error, completedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  if (!results.length) throw new Error("Every configured provider failed to synchronize");
  return { providerCount: providers.length, successfulProviders: results.length, failedProviders: failures.length, serviceCount: results.reduce((sum, item) => sum + item.serviceCount, 0), changedCount: results.reduce((sum, item) => sum + item.changedCount, 0), repricedCount: results.reduce((sum, item) => sum + item.repricedCount, 0), providers: results, failures };
}
