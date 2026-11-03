import { getPublicServicePage } from "@/lib/public-service-details";

export const dynamic = "force-static";
export const revalidate = 300;
export async function generateStaticParams() { return []; }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^SB-[A-F0-9]{16}$/.test(id)) return Response.json({ error: "Service not found" }, { status: 404 });
  const result = await getPublicServicePage(id);
  if (!result) return Response.json({ error: "Service not found" }, { status: 404 });
  const { service, details } = result;
  return Response.json({ id: service.id, name: service.name, fullDescription: details.fullDescription, shortDescription: details.shortDescription, descriptionSource: details.descriptionSource, descriptionHash: details.descriptionHash, min: service.min, max: service.max, refill: service.refill, cancel: service.cancel, rateMinor: service.rateMinor, semantics: service.semantics }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400", ETag: `\"${details.descriptionHash}\"` } });
}
