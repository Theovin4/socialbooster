import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = { title: "Transparent Naira Pricing", description: "Social Booster prices equal the provider website price converted to naira plus an exact 40% markup.", alternates: { canonical: "/pricing" } };

export default function PricingPage() {
  return <><SiteHeader /><main className="shell" style={{ minHeight: "65vh", padding: "100px 0" }}><span className="eyebrow">Simple pricing formula</span><h1 style={{ fontSize: "clamp(2.8rem,7vw,5.5rem)", letterSpacing: "-.06em", maxWidth: 900 }}>Provider price plus exactly 40%.</h1><p className="muted" style={{ fontSize: 20, lineHeight: 1.7, maxWidth: 760 }}>We take the current provider website price, convert it from US dollars to Nigerian naira using the configured exchange rate, then add a 40% markup. Currency calculations use integer-safe rounding.</p><div className="grid3" style={{ marginTop: 42 }}><div className="glass card"><p className="muted">Example provider price</p><strong style={{ fontSize: 30 }}>₦1,000</strong></div><div className="glass card"><p className="muted">40% markup</p><strong style={{ fontSize: 30 }}>₦400</strong></div><div className="glass card"><p className="muted">Customer price</p><strong style={{ fontSize: 30 }}>₦1,400</strong></div></div><div className="glass card" style={{ marginTop: 24, maxWidth: 900 }}><h2>The exact calculation</h2><p className="muted" style={{ lineHeight: 1.8 }}><code>Customer price = converted provider price × 1.40</code></p><p className="muted">There are no custom service price overrides. When the provider price or configured exchange rate changes, synchronized prices are recalculated with the same formula.</p><Link className="btn primary" href="/services">View current NGN prices</Link></div></main><SiteFooter /></>;
}
