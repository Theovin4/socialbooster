import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = { title: "Transparent Naira Pricing", description: "Social Booster prices equal the FollowsPanel NGN API price plus an exact 40% markup.", alternates: { canonical: "/pricing" } };

export default function PricingPage() {
  return <><SiteHeader /><main className="shell" style={{ minHeight: "65vh", padding: "100px 0" }}><span className="eyebrow">Simple pricing formula</span><h1 style={{ fontSize: "clamp(2.8rem,7vw,5.5rem)", letterSpacing: "-.06em", maxWidth: 900 }}>FollowsPanel price plus exactly 40%.</h1><p className="muted" style={{ fontSize: 20, lineHeight: 1.7, maxWidth: 760 }}>We use the current FollowsPanel API rate exactly as supplied in Nigerian naira, then add a 40% markup using integer-safe calculations.</p><div className="grid3" style={{ marginTop: 42 }}><div className="glass card"><p className="muted">FollowsPanel price</p><strong style={{ fontSize: 30 }}>₦1,000</strong></div><div className="glass card"><p className="muted">40% markup</p><strong style={{ fontSize: 30 }}>₦400</strong></div><div className="glass card"><p className="muted">Your customer price</p><strong style={{ fontSize: 30 }}>₦1,400</strong></div></div><div className="glass card" style={{ marginTop: 24, maxWidth: 900 }}><h2>The exact calculation</h2><p className="muted" style={{ lineHeight: 1.8 }}><code>Customer price = FollowsPanel NGN rate × 1.40</code></p><p className="muted">Every active API service is synchronized automatically. When FollowsPanel changes a service or rate, the customer price is recalculated with the same formula.</p><Link className="btn primary" href="/services">View all current services</Link></div></main><SiteFooter /></>;
}
