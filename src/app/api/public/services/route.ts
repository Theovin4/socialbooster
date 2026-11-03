import { getServiceCatalogPage } from "@/lib/service-catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  const unsupportedParameters = [...url.searchParams.keys()].filter((key) => key !== "q");
  if (unsupportedParameters.length || url.searchParams.getAll("q").length > 1) return Response.json({ error: "Unsupported search parameters" }, { status: 400 });
  if (query.length > 80 || query.split(/\s+/u).filter(Boolean).length > 8) return Response.json({ error: "Search is too long" }, { status: 400 });

  const result = await getServiceCatalogPage({ query, page: 1, pageSize: 50 });
  const items = result.items.map((service) => ({
    id: service.id,
    name: service.name,
    category: service.category,
    min: service.min,
    max: service.max,
    rateMinor: service.rateMinor,
    refill: service.refill,
    cancel: service.cancel,
    semantics: service.semantics,
  }));

  return Response.json({ items, total: result.total }, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
  });
}
