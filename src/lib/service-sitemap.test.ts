import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { escapeXml, xmlResponse } from "./sitemap-xml";
import { serviceSitemapXml, type ServiceSitemapCandidate } from "./service-sitemap";

const eligibleService: ServiceSitemapCandidate = {
  id: "SB-0123456789ABCDEF",
  updatedAt: "2026-11-03T12:00:00.000Z",
  active: true,
  seoEligible: true,
};

function sitemapUrls(xml: string) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
}

describe("service sitemap", () => {
  it("includes public URLs for active SEO-eligible services", () => {
    const xml = serviceSitemapXml([eligibleService]);

    expect(sitemapUrls(xml)).toEqual([
      "https://www.socialbooster.net.ng/services/SB-0123456789ABCDEF",
    ]);
    expect(xml).toContain("<lastmod>2026-11-03</lastmod>");
  });

  it("returns a valid empty url set when there are no eligible services", () => {
    const xml = serviceSitemapXml([]);

    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
    );
    expect(sitemapUrls(xml)).toEqual([]);
  });

  it("excludes inactive, private, non-SEO, and non-public-ID services", () => {
    const xml = serviceSitemapXml([
      eligibleService,
      { ...eligibleService, id: "SB-1111111111111111", active: false },
      { ...eligibleService, id: "SB-2222222222222222", seoEligible: false },
      { ...eligibleService, id: "provider_service_123" },
    ]);

    expect(sitemapUrls(xml)).toEqual([
      "https://www.socialbooster.net.ng/services/SB-0123456789ABCDEF",
    ]);
  });

  it("emits only public service URLs and dates, never provider metadata", () => {
    const providerData = {
      ...eligibleService,
      name: "Provider private name",
      providerKey: "private-provider",
      providerServiceId: "provider-123",
      providerRateMinor: 987_654_321,
      apiDetails: "private API data",
    };
    const xml = serviceSitemapXml([providerData]);

    expect(xml).toContain("https://www.socialbooster.net.ng/services/SB-0123456789ABCDEF");
    expect(xml).not.toMatch(/Provider private name|private-provider|provider-123|987654321|private API data/);
  });

  it("escapes all XML reserved characters", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });

  it("keeps the sitemap response cache bounded to one hour", () => {
    const response = xmlResponse(serviceSitemapXml([eligibleService]), 3_600);

    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=3600, stale-while-revalidate=3600",
    );
  });

  it("keeps sitemap generation runtime-only and its data and CDN caches bounded", () => {
    const route = readFileSync(new URL("../app/sitemap-services.xml/route.ts", import.meta.url), "utf8");
    const catalog = readFileSync(new URL("./service-catalog.ts", import.meta.url), "utf8");
    const cachedCatalog = catalog.slice(
      catalog.indexOf("const getCachedSeoEligibleServiceCatalog"),
      catalog.indexOf("export async function getSeoEligibleServiceCatalog"),
    );

    expect(route).toContain('dynamic = "force-dynamic"');
    expect(route).not.toContain('dynamic = "force-static"');
    expect(route).not.toContain("catch");
    expect(route).toContain("xmlResponse(serviceSitemapXml(services), 3_600)");
    expect(cachedCatalog).toContain("revalidate: 3_600");
    expect(cachedCatalog).toContain("tags: [SERVICE_CATALOG_TAG]");
  });

  it("does not turn build-time catalogue unavailability into a cached empty sitemap", () => {
    const route = readFileSync(new URL("../app/sitemap-services.xml/route.ts", import.meta.url), "utf8");
    const admin = readFileSync(new URL("./firebase/admin.ts", import.meta.url), "utf8");

    expect(route).toContain('dynamic = "force-dynamic"');
    expect(route).not.toContain("return xmlResponse(urlSet([]))");
    expect(admin).toContain("productionFirestoreBlocked");
  });
});
