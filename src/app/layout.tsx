import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://socialbooster-sigma.vercel.app";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Social Booster Nigeria | Social Media Marketing Services", template: "%s | Social Booster Nigeria" },
  description: "Buy social media marketing services for Instagram, TikTok, YouTube, Facebook and more. Clear prices, secure payments and live order tracking for Nigeria and Africa.",
  applicationName: "Social Booster Nigeria",
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icon.svg", type: "image/svg+xml" }], shortcut: "/favicon.ico", apple: "/apple-icon.png" },
  keywords: ["social media marketing services Nigeria", "social media services Africa", "Instagram marketing Nigeria", "TikTok promotion Africa", "YouTube promotion Nigeria", "social media reseller panel Africa"],
  alternates: { languages: { "en-NG": "/" } },
  openGraph: { type: "website", locale: "en_NG", url: siteUrl, siteName: "Social Booster", title: "Social Booster | Social Media Services for Nigeria and Africa", description: "Compare social media marketing services, pay securely and track every order from one dashboard." },
  twitter: { card: "summary_large_image", title: "Social Booster Nigeria", description: "Social media marketing services with transparent NGN pricing." },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  category: "business",
  verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#07101f", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const structuredData = { "@context": "https://schema.org", "@graph": [
    { "@type": "Organization", "@id": `${siteUrl}/#organization`, name: "Social Booster", url: siteUrl, logo: `${siteUrl}/icon-512.png`, areaServed: [{ "@type": "Country", name: "Nigeria" }, { "@type": "Continent", name: "Africa" }] },
    { "@type": "WebSite", "@id": `${siteUrl}/#website`, url: siteUrl, name: "Social Booster Nigeria", inLanguage: "en-NG", publisher: { "@id": `${siteUrl}/#organization` }, potentialAction: { "@type": "SearchAction", target: `${siteUrl}/services?q={search_term_string}`, "query-input": "required name=search_term_string" } },
  ] };
  return <html lang="en-NG"><body><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />{children}</body></html>;
}
