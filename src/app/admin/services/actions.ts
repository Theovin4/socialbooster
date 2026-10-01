"use server";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";
import { DEFAULT_GROSS_MARGIN_BPS, decimalToMinor, grossMarginBps, markupBps, sellingPriceForGrossMarginMinor } from "@/lib/money";
import { isProviderKey } from "@/lib/providers";
import { synchronizeProviderServices } from "@/lib/services-sync";

const refresh = () => { revalidateTag("active-service-catalog", "max"); revalidatePath("/admin/services"); revalidatePath("/services"); };
const validServiceId = (id: string) => /^(?:\d+|followspanel_[A-Za-z0-9][A-Za-z0-9_-]{2,127}|(?:nitro|smmworld)_\d+)$/.test(id);

export async function syncAllServices(formData: FormData) {
  await requireAdmin();
  const provider = String(formData.get("provider") || "followspanel");
  if (!isProviderKey(provider)) throw new Error("Invalid provider");
  let outcome = "success";
  try { await synchronizeProviderServices(provider); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[admin:services-sync] failed", { provider, error: message, stack: error instanceof Error ? error.stack : undefined });
    const normalized = message.toLowerCase();
    outcome = normalized.includes("quota") || normalized.includes("resource_exhausted")
      ? "quota"
      : normalized.includes("abort") || normalized.includes("timeout")
        ? "timeout"
        : normalized.includes("catalogue format")
          ? "format"
          : "failed";
  }
  revalidateTag("active-service-catalog", "max"); revalidatePath(`/admin/services?provider=${provider}`); revalidatePath("/services");
  revalidatePath("/admin/provider");
  redirect(`/admin/services?provider=${provider}&sync=${outcome}`);
}

export async function approveService(formData: FormData) {
  const admin = await requireAdmin(), id = String(formData.get("id") || "");
  if (!validServiceId(id)) throw new Error("Invalid service ID");
  const db = adminDb(), provider = await db.collection("providerServices").doc(id).get();
  if (!provider.exists) throw new Error("Provider service not found");
  const data = provider.data()!, providerRateMinor = BigInt(data.providerRateNgnMinor ?? decimalToMinor(String(data.rateText))), grossMarginTargetBps = DEFAULT_GROSS_MARGIN_BPS;
  const sellingRateMinor = sellingPriceForGrossMarginMinor(providerRateMinor, grossMarginTargetBps);
  await db.collection("services").doc(id).set({ providerKey: data.providerKey || "followspanel", providerLabel: data.providerLabel || "Followpanel", providerServiceId: data.providerServiceId, name: data.name, categoryName: data.categoryName, type: data.type, minQuantity: data.minQuantity, maxQuantity: data.maxQuantity, refillSupported: data.refillSupported, cancelSupported: data.cancelSupported, providerCurrency: data.providerCurrency || "NGN", sellingCurrency: "NGN", providerRateMinor: Number(providerRateMinor), providerRateNgnMinor: Number(providerRateMinor), sellingRateMinor: Number(sellingRateMinor), pricingModel: "ngn_gross_margin_v2", grossMarginTargetBps: Number(grossMarginTargetBps), markupBps: Number(markupBps(providerRateMinor, sellingRateMinor)), grossMarginBps: Number(grossMarginBps(providerRateMinor, sellingRateMinor)), marginBps: FieldValue.delete(), customSellingRateMinor: FieldValue.delete(), active: true, visibilityOverride: "show", approvedBy: admin.uid, approvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  refresh();
}

export async function setServiceActive(formData: FormData) {
  const admin = await requireAdmin(), id = String(formData.get("id") || ""), active = String(formData.get("active")) === "true";
  if (!validServiceId(id)) throw new Error("Invalid service ID");
  await adminDb().collection("services").doc(id).set({ active, visibilityOverride: active ? "show" : "hide", updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  refresh();
}

export async function setServicePriceOverride(formData: FormData) {
  const admin = await requireAdmin(), id = String(formData.get("id") || ""), price = String(formData.get("price") || "").trim();
  if (!validServiceId(id)) throw new Error("Invalid service ID");
  const db = adminDb(), ref = db.collection("services").doc(id), snapshot = await ref.get();
  if (!snapshot.exists) throw new Error("Approved service not found");
  const data = snapshot.data()!, providerRateMinor = BigInt(data.providerRateMinor), grossMarginTargetBps = DEFAULT_GROSS_MARGIN_BPS, providerRateNgnMinor = providerRateMinor;
  const sellingRateMinor = sellingPriceForGrossMarginMinor(providerRateMinor, grossMarginTargetBps);
  if (price && decimalToMinor(price) !== sellingRateMinor) throw new Error("Custom prices are disabled. Prices must preserve the standard 40% gross margin.");
  const batch = db.batch();
  batch.set(ref, { providerRateNgnMinor: Number(providerRateNgnMinor), providerCurrency: "NGN", sellingRateMinor: Number(sellingRateMinor), sellingCurrency: "NGN", fxRateMicros: FieldValue.delete(), pricingModel: "ngn_gross_margin_v2", grossMarginTargetBps: Number(grossMarginTargetBps), markupBps: Number(markupBps(providerRateNgnMinor, sellingRateMinor)), grossMarginBps: Number(grossMarginBps(providerRateNgnMinor, sellingRateMinor)), marginBps: FieldValue.delete(), customSellingRateMinor: FieldValue.delete(), belowMinimumMargin: FieldValue.delete(), updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.create(db.collection("auditLogs").doc(), { action: "service_price_reset_to_standard_margin", targetType: "service", targetId: id, providerRateMinor: Number(providerRateMinor), providerRateNgnMinor: Number(providerRateNgnMinor), sellingRateMinor: Number(sellingRateMinor), grossMarginTargetBps: Number(grossMarginTargetBps), markupBps: Number(markupBps(providerRateNgnMinor, sellingRateMinor)), grossMarginBps: Number(grossMarginBps(providerRateNgnMinor, sellingRateMinor)), actorUid: admin.uid, createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  refresh();
}
