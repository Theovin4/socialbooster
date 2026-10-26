import { getServiceCatalogPage } from "@/lib/service-catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  if (query.length > 160) return Response.json({ error: "Search is too long" }, { status: 400 });

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
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
