import { createHash, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { FollowsPanelClient } from "@/lib/providers/followspanel";
import { adminDb } from "@/lib/firebase/admin";
import { configuredMarginBps, decimalToMinor, sellingPriceMinor } from "@/lib/money";

function valid(request: Request) {
  const expected = process.env.CRON_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  return expected.length === supplied.length && expected.length > 0 && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export async function GET(request: Request) {
  if (!valid(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await new FollowsPanelClient().services();
    const db = adminDb();
    let changed = 0;

    let repriced = 0;
    for (let offset = 0; offset < rows.length; offset += 150) {
      const chunk = rows.slice(offset, offset + 150);
      const providerRefs = chunk.map((item) => db.collection("providerServices").doc(String(item.service)));
      const approvedRefs = chunk.map((item) => db.collection("services").doc(String(item.service)));
      const existing = await db.getAll(...providerRefs, ...approvedRefs);
      const batch = db.batch();
      let batchChanges = 0;

      chunk.forEach((item, index) => {
        const service = {
          providerServiceId: item.service,
          name: item.name,
          categoryName: item.category,
          type: item.type,
          rateText: item.rate,
          minQuantity: item.min,
          maxQuantity: item.max,
          refillSupported: item.refill,
          cancelSupported: item.cancel,
          isActive: true,
          providerCurrency: "NGN",
        };
        const syncFingerprint = createHash("sha256").update(JSON.stringify(service)).digest("hex");
        if (existing[index].data()?.syncFingerprint !== syncFingerprint) {
          batch.set(providerRefs[index], { ...service, syncFingerprint, lastSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
          batchChanges += 1;
        }

        const approved = existing[chunk.length + index];
        const approvedData = approved.data() || {};
        const providerRateMinor = decimalToMinor(item.rate);
        if (approved.exists && Number(providerRateMinor) === approvedData.providerRateMinor && approvedData.pricingModel === "ngn_markup_v1" && approvedData.name === item.name && approvedData.minQuantity === item.min && approvedData.maxQuantity === item.max) return;
        const markupBps = configuredMarginBps();
        const sellingRateMinor = Number(sellingPriceMinor(providerRateMinor, markupBps));
        const grossMarginBps = Math.floor((sellingRateMinor - Number(providerRateMinor)) * 10000 / sellingRateMinor);
        batch.set(approvedRefs[index], { providerServiceId: item.service, providerRateMinor: Number(providerRateMinor), providerRateNgnMinor: Number(providerRateMinor), providerCurrency: "NGN", sellingRateMinor, sellingCurrency: "NGN", pricingModel: "ngn_markup_v1", markupBps: Number(markupBps), grossMarginBps, marginBps: FieldValue.delete(), customSellingRateMinor: FieldValue.delete(), name: item.name, categoryName: item.category, type: item.type, minQuantity: item.min, maxQuantity: item.max, refillSupported: item.refill, cancelSupported: item.cancel, active: true, autoImported: true, updatedAt: FieldValue.serverTimestamp(), ...(approved.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
        batch.create(db.collection("auditLogs").doc(), { action: "service_price_synchronized", targetType: "service", targetId: String(item.service), previousProviderRateMinor: approvedData.providerRateMinor, providerRateMinor: Number(providerRateMinor), sellingRateMinor, createdAt: FieldValue.serverTimestamp(), actor: "system:service-sync" });
        batchChanges += 2;
        repriced += 1;
      });

      if (batchChanges > 0) {
        await batch.commit();
        changed += batchChanges;
      }
    }

    await db.collection("providerSyncState").doc("services").set({ completedAt: FieldValue.serverTimestamp(), serviceCount: rows.length, changedCount: changed, repricedCount: repriced }, { merge: true });
    return Response.json({ ok: true, synced: rows.length, changed, repriced });
  } catch (error) {
    console.error(JSON.stringify({ event: "service_sync_failed", message: error instanceof Error ? error.message : "unknown" }));
    return Response.json({ error: "Service synchronization failed" }, { status: 502 });
  }
}
