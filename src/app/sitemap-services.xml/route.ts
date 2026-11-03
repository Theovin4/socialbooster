import { getSeoEligibleServiceCatalog } from "@/lib/service-catalog";
import { serviceSitemapXml } from "@/lib/service-sitemap";
import { xmlResponse } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";

export async function GET() {
  const services = await getSeoEligibleServiceCatalog();
  return xmlResponse(serviceSitemapXml(services), 3_600);
}
