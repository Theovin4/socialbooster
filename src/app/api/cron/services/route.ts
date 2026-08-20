import { timingSafeEqual } from "node:crypto";
import { synchronizeAllProviderServices } from "@/lib/services-sync";

export const maxDuration = 300;
function valid(request: Request) { const expected = process.env.CRON_SECRET || "", supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") || ""; return expected.length === supplied.length && expected.length > 0 && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)); }
export async function GET(request: Request) {
  if (!valid(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { return Response.json({ ok: true, ...(await synchronizeAllProviderServices()) }); }
  catch (error) { console.error("[services:sync] failed", { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }); return Response.json({ error: "Service synchronization failed" }, { status: 502 }); }
}
