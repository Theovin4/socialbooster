"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

const publisherId = "ca-pub-1037358753872630";
const privateRoutes = ["/admin", "/dashboard", "/login", "/register", "/forgot-password"];

export function AdSenseAutoAds() {
  const pathname = usePathname();
  if (privateRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))) return null;
  return <Script
    id="google-adsense-auto-ads"
    async
    strategy="afterInteractive"
    crossOrigin="anonymous"
    src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`}
  />;
}
