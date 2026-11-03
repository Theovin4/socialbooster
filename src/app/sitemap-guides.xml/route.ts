import { guides } from "@/lib/content";
import { publicSiteUrl, urlSet, xmlResponse } from "@/lib/sitemap-xml";

export const dynamic = "force-static";

export function GET() {
  return xmlResponse(urlSet(Object.keys(guides).map((slug) => ({ url: `${publicSiteUrl}/blog/${slug}`, lastModified: "2026-08-29" }))));
}
