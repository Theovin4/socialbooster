import { timingSafeEqual } from "node:crypto";
import { synchronizeAllProviderServices } from "@/lib/services-sync";
import { sendRecentActivationEmails } from "@/lib/activation-campaign";

export const maxDuration = 300;
function valid(request: Request) { const expected = process.env.CRON_SECRET || "", supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") || ""; return expected.length === supplied.length && expected.length > 0 && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)); }
export async function GET(request: Request) {
  if (!valid(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [services, activations] = await Promise.allSettled([synchronizeAllProviderServices(), sendRecentActivationEmails()]);
    if (services.status === "rejected" && activations.status === "rejected") throw services.reason;
    if (services.status === "rejected") console.error("[services:sync] provider synchronization failed", { error: services.reason instanceof Error ? services.reason.message : String(services.reason) });
    if (activations.status === "rejected") console.error("[services:sync] activation recovery failed", { error: activations.reason instanceof Error ? activations.reason.message : String(activations.reason) });
    return Response.json({ ok: true, services: services.status === "fulfilled" ? services.value : { error: "Provider synchronization failed" }, activations: activations.status === "fulfilled" ? activations.value : { error: "Activation recovery failed" } });
  }
  catch (error) { console.error("[services:sync] failed", { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }); return Response.json({ error: "Service synchronization failed" }, { status: 502 }); }
}
