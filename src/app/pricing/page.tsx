import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PricingEstimator, type PricingService } from "@/components/pricing-estimator";
import { getServiceCatalogPage } from "@/lib/service-catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Social Media Service Pricing & Order Calculator",
  description: "Estimate current social media service costs, compare order limits, and understand wallet payments, refills and cancellation options before ordering.",
  alternates: { canonical: "/pricing" },
  openGraph: { title: "Clear Social Media Service Pricing", description: "Use the live estimator to calculate an order total before checkout.", url: "/pricing" },
};

const questions = [
  ["How is my total calculated?", "Each service has a current rate per 1,000 units. Your exact total is calculated from that rate and your chosen quantity, using integer currency calculations."],
  ["What are minimum and maximum quantities?", "Every service has its own permitted order range. The estimator and order form show these limits before you continue."],
  ["Do all services include refill or cancellation?", "No. Refill and cancellation availability depends on the selected service and its stated conditions. Review these details before ordering."],
  ["How do wallet payments work?", "Fund your protected wallet using an available payment method, then place orders from the confirmed balance. Every credit and charge is recorded in transaction history."],
  ["Can agencies and resellers use Social Booster?", "Yes. Agencies and resellers can compare services, use mass ordering where eligible, and create an API key for approved integrations."],
];

export default async function PricingPage() {
  let services: PricingService[] = [];
  try {
    const catalogue = await getServiceCatalogPage({ page: 1, pageSize: 12 });
    services = catalogue.items.map(({ id, name, category, rateMinor, min, max, refill, cancel }) => ({ id, name, category, rateMinor, min, max, refill, cancel }));
  } catch (error) {
    console.warn("[pricing] live examples unavailable", { error: error instanceof Error ? error.message : "Unknown error" });
  }
  const schema = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: questions.map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } })) };

  return <><SiteHeader /><main className="shell pricing-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <section className="pricing-hero"><span className="eyebrow">Transparent service pricing</span><h1>Calculate the right order before you pay.</h1><p className="muted page-lead">Compare live catalogue examples, check service limits, and estimate the exact wallet charge for your quantity.</p><div className="pricing-hero-actions"><a className="btn primary" href="#estimator">Estimate a price</a><Link className="btn" href="/services">Browse all services</Link></div></section>
    <div id="estimator"><PricingEstimator services={services} /></div>
    <section className="pricing-benefits"><article className="glass card"><span className="eyebrow">Before checkout</span><h2>Clear totals</h2><p className="muted">Your rate, quantity and total are displayed before submission. The server recalculates the same total for protection.</p></article><article className="glass card"><span className="eyebrow">Account records</span><h2>Wallet visibility</h2><p className="muted">Verified deposits, order charges and eligible refunds appear in your transaction history.</p></article><article className="glass card"><span className="eyebrow">Service terms</span><h2>Know the limits</h2><p className="muted">Minimums, maximums, refill support and cancellation eligibility are shown for each service.</p></article></section>
    <section className="glass pricing-agency"><div><span className="eyebrow">For agencies and resellers</span><h2>Move from one order to repeatable operations.</h2><p className="muted">Use catalogue search, eligible mass ordering and customer API access while keeping wallet and order records in one account.</p></div><div className="pricing-hero-actions"><Link className="btn primary" href="/register">Create an account</Link><Link className="btn" href="/api-docs">Read API documentation</Link></div></section>
    <section className="pricing-faq"><span className="eyebrow">Pricing questions</span><h2>What to know before ordering</h2><div>{questions.map(([question, answer]) => <details className="glass" key={question}><summary>{question}</summary><p className="muted">{answer}</p></details>)}</div></section>
  </main><SiteFooter /></>;
}
