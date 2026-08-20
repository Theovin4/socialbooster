import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { FollowsPanelClient } from "./providers/followspanel";
import { adminDb } from "./firebase/admin";
import { configuredMarginBps, decimalToMinor, sellingPriceMinor } from "./money";

export async function synchronizeAllProviderServices() {
  const startedAt = Date.now(), rows = await new FollowsPanelClient().services(), db = adminDb();
  const [providerSnapshot, serviceSnapshot] = await Promise.all([db.collection("providerServices").get(), db.collection("services").get()]);
  const providers = new Map(providerSnapshot.docs.map((doc) => [doc.id, doc.data()]));
  const services = new Map(serviceSnapshot.docs.map((doc) => [doc.id, doc.data()]));
  const writer = db.bulkWriter();
  writer.onWriteError((error) => error.failedAttempts < 3);
  const markupBps = configuredMarginBps();
  let changed = 0, repriced = 0;

  for (const item of rows) {
    const id = String(item.service), providerRateMinor = decimalToMinor(item.rate), sellingRateMinor = sellingPriceMinor(providerRateMinor, markupBps);
    const providerData = { providerServiceId: item.service, name: item.name, categoryName: item.category, type: item.type, rateText: item.rate, minQuantity: item.min, maxQuantity: item.max, refillSupported: item.refill, cancelSupported: item.cancel, isActive: true, providerCurrency: "NGN" };
    const syncFingerprint = createHash("sha256").update(JSON.stringify(providerData)).digest("hex");
    if (providers.get(id)?.syncFingerprint !== syncFingerprint) {
      writer.set(db.collection("providerServices").doc(id), { ...providerData, syncFingerprint, lastSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
      changed += 1;
    }
    const existing = services.get(id), pricingFingerprint = createHash("sha256").update(JSON.stringify({ ...providerData, markupBps: Number(markupBps) })).digest("hex");
    if (existing?.pricingFingerprint === pricingFingerprint && existing?.pricingModel === "ngn_markup_v1" && existing?.active === true) continue;
    const grossMarginBps = Number((sellingRateMinor - providerRateMinor) * 10000n / sellingRateMinor);
    writer.set(db.collection("services").doc(id), { providerServiceId: item.service, name: item.name, categoryName: item.category, type: item.type, minQuantity: item.min, maxQuantity: item.max, refillSupported: item.refill, cancelSupported: item.cancel, providerCurrency: "NGN", sellingCurrency: "NGN", providerRateMinor: Number(providerRateMinor), providerRateNgnMinor: Number(providerRateMinor), sellingRateMinor: Number(sellingRateMinor), pricingModel: "ngn_markup_v1", pricingFingerprint, markupBps: Number(markupBps), grossMarginBps, active: true, autoImported: true, customSellingRateMinor: FieldValue.delete(), marginBps: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(), ...(existing ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
    changed += 1; repriced += 1;
  }
  await writer.close();
  const result = { serviceCount: rows.length, changedCount: changed, repricedCount: repriced, durationMs: Date.now() - startedAt };
  await db.collection("providerSyncState").doc("services").set({ ...result, status: "completed", completedAt: FieldValue.serverTimestamp() }, { merge: true });
  console.log("[services:sync] completed", result);
  return result;
}
