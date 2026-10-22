import { z } from "zod";
import { currentUser } from "@/lib/firebase/session";
import { backfillPublicServiceDetails, SERVICE_DESCRIPTION_BACKFILL_CONFIRMATION } from "@/lib/service-description-backfill";
import { PROVIDER_KEYS } from "@/lib/providers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const requestSchema = z.object({ confirmation: z.literal(SERVICE_DESCRIPTION_BACKFILL_CONFIRMATION), dryRun: z.boolean(), provider: z.enum(PROVIDER_KEYS).optional() }).strict();

export async function POST(request: Request) {
  const user = await currentUser(true);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (user.admin !== true) return Response.json({ error: "Administrator access required" }, { status: 403 });
  try {
    const input = requestSchema.parse(await request.json());
    return Response.json(await backfillPublicServiceDetails(input), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Description backfill failed";
    console.error("[service-descriptions:backfill] failed", { error: message });
    return Response.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
