import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://socialbooster-sigma.vercel.app";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Social Booster Nigeria | Social Media Marketing Services", template: "%s | Social Booster Nigeria" },
  description: "Social media marketing services for Nigerian creators, brands and resellers, with transparent naira pricing, verified payments and order tracking.",
  applicationName: "Social Booster Nigeria",
  keywords: ["social media marketing Nigeria", "Instagram marketing Nigeria", "TikTok marketing Nigeria", "YouTube promotion Nigeria", "social media reseller Nigeria"],
  alternates: { languages: { "en-NG": "/" } },
  openGraph: { type: "website", locale: "en_NG", url: siteUrl, siteName: "Social Booster Nigeria", title: "Social Booster Nigeria", description: "Transparent social media marketing services priced in Nigerian naira." },
  twitter: { card: "summary_large_image", title: "Social Booster Nigeria", description: "Social media marketing services with transparent NGN pricing." },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  category: "business",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#07101f", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const structuredData = { "@context": "https://schema.org", "@graph": [
    { "@type": "Organization", "@id": `${siteUrl}/#organization`, name: "Social Booster Nigeria", url: siteUrl, logo: `${siteUrl}/favicon.ico`, areaServed: { "@type": "Country", name: "Nigeria" } },
    { "@type": "WebSite", "@id": `${siteUrl}/#website`, url: siteUrl, name: "Social Booster Nigeria", inLanguage: "en-NG", publisher: { "@id": `${siteUrl}/#organization` }, potentialAction: { "@type": "SearchAction", target: `${siteUrl}/services?q={search_term_string}`, "query-input": "required name=search_term_string" } },
  ] };
  return <html lang="en-NG"><body><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />{children}</body></html>;
}
