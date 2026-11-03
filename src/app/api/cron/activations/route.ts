import { timingSafeEqual } from "node:crypto";
import { sendRecentActivationEmails } from "@/lib/activation-campaign";
import { finishFunctionTiming, startFunctionTiming } from "@/lib/function-timing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function valid(request: Request) {
  const expected = process.env.CRON_SECRET || "", supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  return expected.length === supplied.length && expected.length > 0 && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export async function GET(request: Request) {
  if (!valid(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const timingStart = startFunctionTiming();
  try { const result = await sendRecentActivationEmails(); const timing = finishFunctionTiming(timingStart); console.info("[cron:activations] complete", timing); return Response.json({ ok: true, result, timing }); }
  catch (error) { const timing = finishFunctionTiming(timingStart); console.error("[cron:activations] failed", { error: error instanceof Error ? error.message : String(error), ...timing }); return Response.json({ error: "Activation recovery failed", timing }, { status: 502 }); }
}
