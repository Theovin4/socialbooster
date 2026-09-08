import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase/admin";
import { configuredUsdToNgnRateMicros, convertMinor } from "./currency";
import { DEFAULT_MARGIN_BPS, decimalToMinor, sellingPriceMinor } from "./money";
import { providerDefinitions, providerServiceDocumentId, type ProviderDefinition } from "./providers";

export async function synchronizeProviderServices(providerKey: ProviderDefinition["key"]) {
  const provider = providerDefinitions().find((item) => item.key === providerKey);
  if (!provider?.configured) throw new Error(`${provider?.label || providerKey} is not configured`);
  const startedAt = Date.now(), rows = await provider.client.services(), db = adminDb();
  const [providerSnapshot, serviceSnapshot] = await Promise.all([
    provider.key === "followspanel" ? db.collection("providerServices").get() : db.collection("providerServices").where("providerKey", "==", provider.key).get(),
    provider.key === "followspanel" ? db.collection("services").get() : db.collection("services").where("providerKey", "==", provider.key).get(),
  ]);
  const providers = new Map(providerSnapshot.docs.filter((doc) => provider.key !== "followspanel" || !doc.id.includes("_")).map((doc) => [doc.id, doc.data()]));
  const services = new Map(serviceSnapshot.docs.filter((doc) => provider.key !== "followspanel" || !doc.id.includes("_")).map((doc) => [doc.id, doc.data()]));
  const writer = db.bulkWriter();
  writer.onWriteError((error) => error.failedAttempts < 3);
  const markupBps = DEFAULT_MARGIN_BPS, usdToNgn = configuredUsdToNgnRateMicros();
  let changed = 0, repriced = 0;

  for (const item of rows) {
    const id = providerServiceDocumentId(provider.key, item.service);
    const nativeRateMinor = decimalToMinor(item.rate);
    const providerRateNgnMinor = provider.currency === "USD" ? convertMinor(nativeRateMinor, usdToNgn) : nativeRateMinor;
    const sellingRateMinor = sellingPriceMinor(providerRateNgnMinor, markupBps);
    const providerData = { providerKey: provider.key, providerLabel: provider.label, providerServiceId: item.service, name: item.name, description: "description" in item ? item.description || "" : "", categoryName: item.category, type: item.type, rateText: item.rate, providerNativeRateMinor: Number(nativeRateMinor), providerRateNgnMinor: Number(providerRateNgnMinor), minQuantity: item.min, maxQuantity: item.max, refillSupported: item.refill, cancelSupported: item.cancel, isActive: true, providerCurrency: provider.currency };
    const syncFingerprint = createHash("sha256").update(JSON.stringify(providerData)).digest("hex");
    if (providers.get(id)?.syncFingerprint !== syncFingerprint) {
      writer.set(db.collection("providerServices").doc(id), { ...providerData, syncFingerprint, lastSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
      changed += 1;
    }
    const existing = services.get(id), pricingFingerprint = createHash("sha256").update(JSON.stringify({ ...providerData, providerRateNgnMinor: String(providerRateNgnMinor), markupBps: Number(markupBps) })).digest("hex");
    const active = provider.key === "followspanel" ? existing?.active === true : true;
    if (existing?.pricingFingerprint === pricingFingerprint && existing?.pricingModel === "ngn_markup_v1" && existing?.active === active) continue;
    const grossMarginBps = Number((sellingRateMinor - providerRateNgnMinor) * 10000n / sellingRateMinor);
    writer.set(db.collection("services").doc(id), { ...providerData, providerNativeRateMinor: Number(nativeRateMinor), providerRateMinor: Number(providerRateNgnMinor), providerRateNgnMinor: Number(providerRateNgnMinor), sellingCurrency: "NGN", sellingRateMinor: Number(sellingRateMinor), pricingModel: "ngn_markup_v1", pricingFingerprint, markupBps: Number(markupBps), grossMarginBps, active, autoImported: true, customSellingRateMinor: FieldValue.delete(), marginBps: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(), ...(existing ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
    changed += 1; repriced += 1;
  }
  await writer.close();
  const result = { provider: provider.key, serviceCount: rows.length, changedCount: changed, repricedCount: repriced, durationMs: Date.now() - startedAt };
  await db.collection("providerSyncState").doc(provider.key).set({ ...result, status: "completed", completedAt: FieldValue.serverTimestamp() }, { merge: true });
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
