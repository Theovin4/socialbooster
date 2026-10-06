import { publicSiteUrl, urlSet, xmlResponse } from "@/lib/sitemap-xml";

const updated = "2026-10-04";
const paths = ["", "/services", "/pricing", "/payments", "/payments/crypto", "/resellers", "/api-docs", "/how-it-works", "/blog", "/about", "/editorial-policy", "/contact", "/faq", "/terms", "/privacy", "/refund-policy", "/acceptable-use", "/cookie-policy"];

export function GET() {
  return xmlResponse(urlSet(paths.map((path) => ({ url: `${publicSiteUrl}${path || "/"}`, lastModified: updated }))));
}
