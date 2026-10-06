import type { MetadataRoute } from "next";

const siteUrl = "https://www.socialbooster.net.ng";
const privatePaths = ["/dashboard/", "/admin/", "/api/", "/login", "/register", "/forgot-password"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: privatePaths },
      { userAgent: "Googlebot", allow: "/", disallow: privatePaths },
      { userAgent: "OAI-SearchBot", allow: "/", disallow: privatePaths },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
