import type { Metadata } from "next";
import Link from "next/link";
import { ResellerInterestLink } from "@/components/reseller-interest-link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Social Media Services for Resellers and Agencies",
  description: "Use Social Booster mass ordering and a documented API to manage social media service orders for an agency or reseller workflow.",
  alternates: { canonical: "/resellers" },
  openGraph: { title: "Reseller and Agency Tools", description: "Mass ordering, API access and central order tracking for professional workflows.", url: "/resellers" },
};

export default function ResellersPage() {
  return <><SiteHeader /><main className="shell" style={{ padding: "88px 0", minHeight: "65vh" }}>
    <span className="eyebrow">Agency and reseller workflows</span><h1 style={{ fontSize: "clamp(2.8rem,7vw,5.4rem)", letterSpacing: "-.055em", maxWidth: 1050 }}>Manage repeat orders without losing operational control.</h1>
    <p className="muted page-lead">Use one wallet, searchable services, mass ordering and API access to manage eligible orders. Prices, limits and service availability remain visible before submission.</p>
    <section className="grid3" style={{ marginTop: 38 }}><article className="glass card"><h2>Mass ordering</h2><p className="muted">Prepare multiple eligible orders from the customer dashboard and review each target, quantity and charge before submission.</p></article><article className="glass card"><h2>API access</h2><p className="muted">Create a private API key, list services, check balance, submit retry-safe orders and retrieve status through the documented v2 interface.</p></article><article className="glass card"><h2>One wallet</h2><p className="muted">Fund one protected NGN wallet and see the exact customer charge before each manual, mass-order or API submission.</p></article><article className="glass card"><h2>Central tracking</h2><p className="muted">Review customer-facing order references, delivery status and support options without exposing upstream infrastructure.</p></article></section>
    <section className="glass card" style={{ marginTop: 24 }}><h2>Start responsibly</h2><p className="muted" style={{ lineHeight: 1.75 }}>Test a small order first, keep API keys on a secure server, use an idempotency key for every submission and review platform rules before offering a service to a client. No volume discount or delivery result should be assumed unless it is shown in your account.</p></section>
    <section className="glass card" style={{ marginTop: 24 }}><span className="eyebrow">Onboarding</span><h2>Build your workflow in three steps</h2><ol className="muted" style={{ lineHeight: 1.9 }}><li>Create an account and review current services, limits and NGN prices.</li><li>Fund your wallet safely, then test a small manual or mass order.</li><li>Create a private API key only when you are ready to integrate server-side.</li></ol></section>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}><ResellerInterestLink /><Link className="btn" href="/api-docs">Read API documentation</Link><Link className="btn" href="/acceptable-use">Acceptable use</Link></div>
  </main><SiteFooter /></>;
}
