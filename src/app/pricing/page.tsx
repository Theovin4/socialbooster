import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Clear Social Media Service Pricing",
  description: "Compare current social media service prices, order limits and refill options before placing an order.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return <><SiteHeader /><main className="shell" style={{ minHeight: "65vh", padding: "90px 0" }}><span className="eyebrow">Pricing</span><h1 style={{ fontSize: "clamp(2.8rem,7vw,5.5rem)", letterSpacing: "-.06em", maxWidth: 900 }}>Know the price before you order.</h1><p className="muted page-lead">Choose a service and quantity to see your exact total.</p><div className="grid3" style={{ marginTop: 36 }}><article className="glass card"><h2>Clear pricing</h2><p className="muted">Compare current service rates.</p></article><article className="glass card"><h2>Exact totals</h2><p className="muted">See your charge before submitting.</p></article><article className="glass card"><h2>Flexible payments</h2><p className="muted">Fund your wallet using available local or cryptocurrency options.</p></article></div><div style={{ marginTop: 30 }}><Link className="btn primary" href="/services">View prices</Link></div></main><SiteFooter /></>;
}
