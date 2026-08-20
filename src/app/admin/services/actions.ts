"use server";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";
import { configuredMarginBps, decimalToMinor, sellingPriceMinor } from "@/lib/money";
import { configuredUsdToNgnRateMicros, convertMinor } from "@/lib/currency";

const refresh = () => { revalidatePath("/admin/services"); revalidatePath("/services"); };

export async function approveService(formData: FormData) {
  const admin = await requireAdmin(), id = String(formData.get("id") || "");
  if (!/^\d+$/.test(id)) throw new Error("Invalid service ID");
  const db = adminDb(), provider = await db.collection("providerServices").doc(id).get();
  if (!provider.exists) throw new Error("Provider service not found");
  const data = provider.data()!, providerRateMinor = decimalToMinor(String(data.rateText)), markupBps = configuredMarginBps(), fxRateMicros = configuredUsdToNgnRateMicros();
  const providerRateNgnMinor = convertMinor(providerRateMinor, fxRateMicros), sellingRateMinor = sellingPriceMinor(providerRateNgnMinor, markupBps), grossMarginBps = Number((sellingRateMinor-providerRateNgnMinor)*10000n/sellingRateMinor);
  await db.collection("services").doc(id).set({ providerServiceId: data.providerServiceId, name: data.name, categoryName: data.categoryName, type: data.type, minQuantity: data.minQuantity, maxQuantity: data.maxQuantity, refillSupported: data.refillSupported, cancelSupported: data.cancelSupported, providerCurrency: "USD", sellingCurrency: "NGN", providerRateMinor: Number(providerRateMinor), providerRateNgnMinor: Number(providerRateNgnMinor), sellingRateMinor: Number(sellingRateMinor), fxRateMicros: Number(fxRateMicros), pricingModel: "markup_v1", markupBps: Number(markupBps), grossMarginBps, marginBps: FieldValue.delete(), customSellingRateMinor: FieldValue.delete(), active: true, approvedBy: admin.uid, approvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  refresh();
}

export async function setServiceActive(formData: FormData) {
  const admin = await requireAdmin(), id = String(formData.get("id") || ""), active = String(formData.get("active")) === "true";
  if (!/^\d+$/.test(id)) throw new Error("Invalid service ID");
  await adminDb().collection("services").doc(id).set({ active, updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  refresh();
}

export async function setServicePriceOverride(formData: FormData) {
  const admin = await requireAdmin(), id = String(formData.get("id") || ""), price = String(formData.get("price") || "").trim();
  if (!/^\d+$/.test(id)) throw new Error("Invalid service ID");
  const db = adminDb(), ref = db.collection("services").doc(id), snapshot = await ref.get();
  if (!snapshot.exists) throw new Error("Approved service not found");
  const data = snapshot.data()!, providerRateMinor = BigInt(data.providerRateMinor), markupBps = configuredMarginBps(), fxRateMicros = configuredUsdToNgnRateMicros(), providerRateNgnMinor = convertMinor(providerRateMinor, fxRateMicros);
  const sellingRateMinor = sellingPriceMinor(providerRateNgnMinor, markupBps);
  if (price && decimalToMinor(price) !== sellingRateMinor) throw new Error("Custom prices are disabled. Prices must equal provider cost plus 40%.");
  const grossMarginBps = Number((sellingRateMinor - providerRateNgnMinor) * 10000n / sellingRateMinor);
  const batch = db.batch();
  batch.set(ref, { providerRateNgnMinor: Number(providerRateNgnMinor), sellingRateMinor: Number(sellingRateMinor), sellingCurrency: "NGN", fxRateMicros: Number(fxRateMicros), pricingModel: "markup_v1", markupBps: Number(markupBps), grossMarginBps, marginBps: FieldValue.delete(), customSellingRateMinor: FieldValue.delete(), belowMinimumMargin: FieldValue.delete(), updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.create(db.collection("auditLogs").doc(), { action: "service_price_reset_to_standard_markup", targetType: "service", targetId: id, providerRateMinor: Number(providerRateMinor), providerRateNgnMinor: Number(providerRateNgnMinor), sellingRateMinor: Number(sellingRateMinor), markupBps: Number(markupBps), grossMarginBps, actorUid: admin.uid, createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  refresh();
}
