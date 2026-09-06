import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Transparent Naira Pricing",
  description: "Browse clear, up-to-date social media service prices in Nigerian naira.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return <><SiteHeader /><main className="shell" style={{ minHeight: "65vh", padding: "90px 0" }}><span className="eyebrow">Pricing</span><h1 style={{ fontSize: "clamp(2.8rem,7vw,5.5rem)", letterSpacing: "-.06em", maxWidth: 900 }}>Know the price before you order.</h1><p className="muted page-lead">Prices are shown in naira and totals update with your quantity.</p><div className="grid3" style={{ marginTop: 36 }}><article className="glass card"><h2>Naira pricing</h2><p className="muted">No checkout conversion.</p></article><article className="glass card"><h2>Exact totals</h2><p className="muted">See your charge before submitting.</p></article><article className="glass card"><h2>Clear limits</h2><p className="muted">Compare minimums, maximums and refill terms.</p></article></div><div style={{ marginTop: 30 }}><Link className="btn primary" href="/services">View prices</Link></div></main><SiteFooter /></>;
}
