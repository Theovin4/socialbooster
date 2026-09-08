"use server";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";
import { DEFAULT_MARGIN_BPS, decimalToMinor, sellingPriceMinor } from "@/lib/money";
import { isProviderKey } from "@/lib/providers";
import { synchronizeProviderServices } from "@/lib/services-sync";

const refresh = () => { revalidatePath("/admin/services"); revalidatePath("/services"); };
const validServiceId = (id: string) => /^(?:\d+|(?:nitro|smmworld)_\d+)$/.test(id);

export async function syncAllServices(formData: FormData) {
  await requireAdmin();
  const provider = String(formData.get("provider") || "followspanel");
  if (!isProviderKey(provider)) throw new Error("Invalid provider");
  try { await synchronizeProviderServices(provider); }
  catch (error) { console.error("[admin:services-sync] failed", { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }); throw new Error("Service synchronization failed. Check the production logs for the recorded cause."); }
  revalidatePath(`/admin/services?provider=${provider}`); revalidatePath("/services");
}

export async function approveService(formData: FormData) {
  const admin = await requireAdmin(), id = String(formData.get("id") || "");
  if (!validServiceId(id)) throw new Error("Invalid service ID");
  const db = adminDb(), provider = await db.collection("providerServices").doc(id).get();
  if (!provider.exists) throw new Error("Provider service not found");
  const data = provider.data()!, providerRateMinor = BigInt(data.providerRateNgnMinor ?? decimalToMinor(String(data.rateText))), markupBps = DEFAULT_MARGIN_BPS;
  const sellingRateMinor = sellingPriceMinor(providerRateMinor, markupBps), grossMarginBps = Number((sellingRateMinor-providerRateMinor)*10000n/sellingRateMinor);
  await db.collection("services").doc(id).set({ providerKey: data.providerKey || "followspanel", providerLabel: data.providerLabel || "Followpanel", providerServiceId: data.providerServiceId, name: data.name, categoryName: data.categoryName, type: data.type, minQuantity: data.minQuantity, maxQuantity: data.maxQuantity, refillSupported: data.refillSupported, cancelSupported: data.cancelSupported, providerCurrency: data.providerCurrency || "NGN", sellingCurrency: "NGN", providerRateMinor: Number(providerRateMinor), providerRateNgnMinor: Number(providerRateMinor), sellingRateMinor: Number(sellingRateMinor), pricingModel: "ngn_markup_v1", markupBps: Number(markupBps), grossMarginBps, marginBps: FieldValue.delete(), customSellingRateMinor: FieldValue.delete(), active: true, approvedBy: admin.uid, approvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  refresh();
}

export async function setServiceActive(formData: FormData) {
  const admin = await requireAdmin(), id = String(formData.get("id") || ""), active = String(formData.get("active")) === "true";
  if (!validServiceId(id)) throw new Error("Invalid service ID");
  await adminDb().collection("services").doc(id).set({ active, updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  refresh();
}

export async function setServicePriceOverride(formData: FormData) {
  const admin = await requireAdmin(), id = String(formData.get("id") || ""), price = String(formData.get("price") || "").trim();
  if (!validServiceId(id)) throw new Error("Invalid service ID");
  const db = adminDb(), ref = db.collection("services").doc(id), snapshot = await ref.get();
  if (!snapshot.exists) throw new Error("Approved service not found");
  const data = snapshot.data()!, providerRateMinor = BigInt(data.providerRateMinor), markupBps = DEFAULT_MARGIN_BPS, providerRateNgnMinor = providerRateMinor;
  const sellingRateMinor = sellingPriceMinor(providerRateMinor, markupBps);
  if (price && decimalToMinor(price) !== sellingRateMinor) throw new Error("Custom prices are disabled. Prices must equal provider cost plus 40%.");
  const grossMarginBps = Number((sellingRateMinor - providerRateNgnMinor) * 10000n / sellingRateMinor);
  const batch = db.batch();
  batch.set(ref, { providerRateNgnMinor: Number(providerRateNgnMinor), providerCurrency: "NGN", sellingRateMinor: Number(sellingRateMinor), sellingCurrency: "NGN", fxRateMicros: FieldValue.delete(), pricingModel: "ngn_markup_v1", markupBps: Number(markupBps), grossMarginBps, marginBps: FieldValue.delete(), customSellingRateMinor: FieldValue.delete(), belowMinimumMargin: FieldValue.delete(), updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.create(db.collection("auditLogs").doc(), { action: "service_price_reset_to_standard_markup", targetType: "service", targetId: id, providerRateMinor: Number(providerRateMinor), providerRateNgnMinor: Number(providerRateNgnMinor), sellingRateMinor: Number(sellingRateMinor), markupBps: Number(markupBps), grossMarginBps, actorUid: admin.uid, createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  refresh();
}
