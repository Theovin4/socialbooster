import { createHash, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { FollowsPanelClient } from "@/lib/providers/followspanel";
import { adminDb } from "@/lib/firebase/admin";

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

    for (let offset = 0; offset < rows.length; offset += 450) {
      const chunk = rows.slice(offset, offset + 450);
      const refs = chunk.map((item) => db.collection("providerServices").doc(String(item.service)));
      const existing = await db.getAll(...refs);
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
          providerCurrency: "USD",
        };
        const syncFingerprint = createHash("sha256").update(JSON.stringify(service)).digest("hex");
        if (existing[index].data()?.syncFingerprint === syncFingerprint) return;
        batch.set(refs[index], { ...service, syncFingerprint, lastSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
        batchChanges += 1;
      });

      if (batchChanges > 0) {
        await batch.commit();
        changed += batchChanges;
      }
    }

    await db.collection("providerSyncState").doc("services").set({ completedAt: FieldValue.serverTimestamp(), serviceCount: rows.length, changedCount: changed }, { merge: true });
    return Response.json({ ok: true, synced: rows.length, changed });
  } catch (error) {
    console.error(JSON.stringify({ event: "service_sync_failed", message: error instanceof Error ? error.message : "unknown" }));
    return Response.json({ error: "Service synchronization failed" }, { status: 502 });
  }
}
