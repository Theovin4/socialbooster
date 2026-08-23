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
  return <><SiteHeader /><main className="shell" style={{ minHeight: "65vh", padding: "100px 0" }}><span className="eyebrow">Straightforward pricing</span><h1 style={{ fontSize: "clamp(2.8rem,7vw,5.5rem)", letterSpacing: "-.06em", maxWidth: 900 }}>Know the price before you order.</h1><p className="muted" style={{ fontSize: 20, lineHeight: 1.7, maxWidth: 760 }}>Every customer price is displayed in Nigerian naira. Choose a service and quantity to see the exact charge before submitting an order.</p><div className="grid3" style={{ marginTop: 42 }}><article className="glass card"><p className="eyebrow">Local currency</p><h2>Prices in naira</h2><p className="muted">No confusing currency conversion at checkout.</p></article><article className="glass card"><p className="eyebrow">Clear totals</p><h2>Exact calculation</h2><p className="muted">Your total updates with the quantity you enter.</p></article><article className="glass card"><p className="eyebrow">Order confidence</p><h2>Limits shown upfront</h2><p className="muted">Minimums, maximums and refill availability are easy to compare.</p></article></div><div style={{ marginTop: 30 }}><Link className="btn primary" href="/services">View current services and prices</Link></div></main><SiteFooter /></>;
}
