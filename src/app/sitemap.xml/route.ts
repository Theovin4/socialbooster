import { sitemapIndex, xmlResponse } from "@/lib/sitemap-xml";

export function GET() {
  return xmlResponse(sitemapIndex(["/sitemap-pages.xml", "/sitemap-platforms.xml", "/sitemap-africa.xml", "/sitemap-guides.xml", "/sitemap-services.xml"]));
}
