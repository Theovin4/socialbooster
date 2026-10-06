import { publicSiteUrl, urlSet, xmlResponse } from "@/lib/sitemap-xml";

export function GET() {
  return xmlResponse(urlSet(["instagram", "tiktok", "facebook", "youtube", "telegram"].map((path) => ({ url: `${publicSiteUrl}/${path}`, lastModified: "2026-10-04" }))));
}
