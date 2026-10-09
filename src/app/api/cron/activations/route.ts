import { timingSafeEqual } from "node:crypto";
import { sendRecentActivationEmails } from "@/lib/activation-campaign";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function valid(request: Request) {
  const expected = process.env.CRON_SECRET || "", supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  return expected.length === supplied.length && expected.length > 0 && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export async function GET(request: Request) {
  if (!valid(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { return Response.json({ ok: true, result: await sendRecentActivationEmails() }); }
  catch (error) { console.error("[cron:activations] failed", { error: error instanceof Error ? error.message : String(error) }); return Response.json({ error: "Activation recovery failed" }, { status: 502 }); }
}
