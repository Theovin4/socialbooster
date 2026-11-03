import { getSeoEligibleServiceCatalog } from "@/lib/service-catalog";
import { publicSiteUrl, urlSet, xmlResponse } from "@/lib/sitemap-xml";

export const dynamic = "force-static";
export const revalidate = 3_600;

export async function GET() {
  try {
    const services = await getSeoEligibleServiceCatalog();
    return xmlResponse(urlSet(services.map((service) => ({ url: `${publicSiteUrl}/services/${service.id}`, lastModified: service.updatedAt?.slice(0, 10) || "2026-10-04" }))));
  } catch {
    return xmlResponse(urlSet([]));
  }
}
