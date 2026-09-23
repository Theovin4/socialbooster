import type { MetadataRoute } from "next";
import { guides } from "@/lib/content";
import { getActiveServiceCatalog } from "@/lib/service-catalog";
const siteUrl = "https://www.socialbooster.net.ng";
const contentUpdated = new Date("2026-08-29T00:00:00+01:00");
const routes = ["", "services", "pricing", "api-docs", "how-it-works", "africa", "blog", "about", "editorial-policy", "contact", "faq", "terms", "privacy", "refund-policy", "acceptable-use", "cookie-policy"];
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = routes.map((path) => ({ url: `${siteUrl}/${path}`, lastModified: contentUpdated, changeFrequency: path === "" || path === "services" ? "daily" : "monthly", priority: path === "" ? 1 : path === "services" ? .9 : .6 }));
  staticRoutes.push(...Object.keys(guides).map((slug) => ({ url: `${siteUrl}/blog/${slug}`, lastModified: contentUpdated, changeFrequency: "monthly" as const, priority: .7 })));
  try { const services = await getActiveServiceCatalog(); return [...staticRoutes, ...services.slice(0, 1000).map((service) => ({ url: `${siteUrl}/services/${service.id}`, lastModified: service.updatedAt ? new Date(service.updatedAt) : contentUpdated, changeFrequency: "weekly" as const, priority: .7 }))]; } catch { return staticRoutes; }
}
