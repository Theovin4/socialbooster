import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { synchronizeAllProviderServices } from "@/lib/services-sync";
import { resetJoinedToday } from "@/lib/firebase/stats";
import { publicServiceDetailsTag, publicServicePageTag } from "@/lib/public-service-details";
import { publicServiceId } from "@/lib/service-public-id";
import { finishFunctionTiming, startFunctionTiming } from "@/lib/function-timing";

export const dynamic = "force-dynamic";
// The provider catalogue endpoint has historically exceeded 60 seconds. Each
// upstream request and retry remains bounded, while the longer function ceiling
// prevents a completed provider download from being discarded and repeated on
// the following run.
export const maxDuration = 300;
function valid(request: Request) { const expected = process.env.CRON_SECRET || "", supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") || ""; return expected.length === supplied.length && expected.length > 0 && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)); }
export async function GET(request: Request) {
  if (!valid(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const timingStart = startFunctionTiming();
  try {
    const [services, stats] = await Promise.allSettled([synchronizeAllProviderServices(), resetJoinedToday()]);
    if (services.status === "rejected" && stats.status === "rejected") throw services.reason;
    if (services.status === "rejected") console.error("[services:sync] provider synchronization failed", { error: services.reason instanceof Error ? services.reason.message : String(services.reason) });
    else {
      if (services.value.publicCatalogueChanged) revalidateTag("active-service-catalog", "max");
      services.value.detailChangedIds.forEach((id) => {
        revalidateTag(publicServiceDetailsTag(id), "max");
        revalidateTag(publicServicePageTag(publicServiceId(id)), "max");
      });
    }
    if (stats.status === "rejected") console.error("[services:sync] daily counter reset failed", { error: stats.reason instanceof Error ? stats.reason.message : String(stats.reason) });
    const timing = finishFunctionTiming(timingStart);
    console.info("[cron:services] complete", timing);
    return Response.json({ ok: true, services: services.status === "fulfilled" ? services.value : { error: "Provider synchronization failed" }, stats: stats.status === "fulfilled" ? stats.value : { error: "Daily counter reset failed" }, timing });
  }
  catch (error) { const timing = finishFunctionTiming(timingStart); console.error("[services:sync] failed", { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined, ...timing }); return Response.json({ error: "Service synchronization failed", timing }, { status: 502 }); }
}
