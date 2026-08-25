import type { MetadataRoute } from "next";
import { adminDb } from "@/lib/firebase/admin";
import { guides } from "@/lib/content";
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng";
const routes = ["", "services", "pricing", "how-it-works", "africa", "blog", "about", "contact", "faq", "terms", "privacy", "refund-policy", "acceptable-use", "cookie-policy"];
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = routes.map((path) => ({ url: `${siteUrl}/${path}`, lastModified: new Date(), changeFrequency: path === "" || path === "services" ? "daily" : "monthly", priority: path === "" ? 1 : path === "services" ? .9 : .6 }));
  staticRoutes.push(...Object.keys(guides).map((slug) => ({ url: `${siteUrl}/blog/${slug}`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: .7 })));
  try { const snapshot = await adminDb().collection("services").where("active", "==", true).limit(1000).get(); return [...staticRoutes, ...snapshot.docs.map((doc) => ({ url: `${siteUrl}/services/${doc.id}`, lastModified: doc.get("updatedAt")?.toDate?.() || new Date(), changeFrequency: "weekly" as const, priority: .7 }))]; } catch { return staticRoutes; }
}
