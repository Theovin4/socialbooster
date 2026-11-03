import { publicSiteUrl, urlSet, xmlResponse } from "@/lib/sitemap-xml";

export const dynamic = "force-static";

export function GET() {
  return xmlResponse(urlSet([{ url: `${publicSiteUrl}/africa`, lastModified: "2026-10-04" }]));
}
