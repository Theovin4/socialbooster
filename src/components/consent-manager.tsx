"use client";

import Script from "next/script";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Consent = { analytics: boolean; advertising: boolean };
const storageKey = "sb_privacy_consent_v1";
const privateRoutes = ["/admin", "/dashboard", "/login", "/register", "/forgot-password"];

export function ConsentManager() {
  const pathname = usePathname();
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const privatePage = privateRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  useEffect(() => {
    let next: Consent | null = null;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Consent>;
        if (typeof parsed.analytics === "boolean" && typeof parsed.advertising === "boolean") {
          next = { analytics: parsed.analytics, advertising: parsed.advertising };
        }
      }
    } catch { /* Invalid or inaccessible browser storage falls back to no optional consent. */ }
    const task = window.setTimeout(() => setConsent(next), 0);
    return () => {
      window.clearTimeout(task);
    };
  }, []);
  function save(next: Consent) {
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    setConsent(next);
    setOpen(false);
  }
  if (consent === undefined) return null;
  const chooser = consent === null || open;
  return <>
    {!privatePage && consent?.analytics ? <><Script src="https://www.googletagmanager.com/gtag/js?id=G-NEZPXRW3M4" strategy="afterInteractive" /><Script id="social-booster-google-analytics" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-NEZPXRW3M4',{anonymize_ip:true});`}</Script></> : null}
    {!privatePage && consent?.advertising ? <Script id="google-adsense-auto-ads" async strategy="afterInteractive" crossOrigin="anonymous" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1037358753872630" /> : null}
    {chooser ? <aside className="glass" role="dialog" aria-modal="true" aria-labelledby="privacy-choice-title" style={{ position: "fixed", zIndex: 1000, left: 18, right: 18, bottom: 18, maxWidth: 720, margin: "0 auto", padding: 22, boxShadow: "0 24px 80px rgba(0,0,0,.45)" }}><strong id="privacy-choice-title" style={{ fontSize: 20 }}>Your privacy choices</strong><p className="muted" style={{ lineHeight: 1.65 }}>Essential storage keeps sign-in and security features working. With your permission, analytics helps us understand public-page performance and advertising supports public content. You can change this choice at any time. Read our <Link href="/cookie-policy">Cookie Policy</Link>.</p><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><button className="btn primary" type="button" onClick={() => save({ analytics: true, advertising: true })}>Accept all</button><button className="btn" type="button" onClick={() => save({ analytics: true, advertising: false })}>Analytics only</button><button className="btn" type="button" onClick={() => save({ analytics: false, advertising: false })}>Essential only</button></div></aside> : <button className="btn" type="button" onClick={() => setOpen(true)} style={{ position: "fixed", zIndex: 900, left: 14, bottom: 14, fontSize: 13 }}>Privacy choices</button>}
  </>;
}
