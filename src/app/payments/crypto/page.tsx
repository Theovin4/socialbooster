import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Pay with Bitcoin or USDT",
  description: "Fund a Social Booster wallet with supported Bitcoin or USDT networks using a time-limited quote, blockchain confirmation and payment review.",
  alternates: { canonical: "/payments/crypto" },
  openGraph: { title: "Cryptocurrency Payments on Social Booster", description: "A clear guide to supported crypto wallet funding and verification.", url: "/payments/crypto" },
};

const steps = ["Sign in, open Fund wallet and choose cryptocurrency.", "Select BTC or a supported USDT network and enter the wallet amount you want to fund.", "Review the time-limited quote and send only on the exact network shown.", "Submit the transaction hash when requested and wait for blockchain confirmation and payment review.", "When verified, the credited amount and transaction appear in your wallet history."];

export default function CryptoPaymentsPage() {
  const faq = [
    { q: "Which assets are supported?", a: "The wallet currently presents Bitcoin and supported USDT network options. Only use an asset and network that appear in your live quote." },
    { q: "What happens when a quote expires?", a: "Do not pay an expired quote. Create a new quote so the destination, amount and verification window are current." },
    { q: "What if I send a different amount?", a: "The verified amount received is reviewed and the wallet credit is calculated from the approved payment. Network fees and unsupported-network transfers are not treated as received funds." },
    { q: "Can a crypto payment be reversed?", a: "Blockchain transfers are generally irreversible. Wallet refunds are reviewed under the published refund policy and do not reverse the original network transfer." },
  ];
  const schema = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })) };
  return <><SiteHeader /><main className="shell" style={{ padding: "88px 0", minHeight: "65vh", maxWidth: 980 }}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <span className="eyebrow">Cryptocurrency funding</span><h1 style={{ fontSize: "clamp(2.8rem,7vw,5.2rem)", letterSpacing: "-.055em" }}>Pay with supported Bitcoin or USDT options.</h1>
    <p className="muted page-lead">Crypto deposits use a live, time-limited quote and are credited only after the transfer is confirmed and approved. The authenticated wallet always contains the current payment instructions.</p>
    <section className="glass card" style={{ marginTop: 34 }}><h2>Payment flow</h2><ol className="muted" style={{ lineHeight: 2 }}>{steps.map((step) => <li key={step}>{step}</li>)}</ol></section>
    <section style={{ marginTop: 34 }}><h2>Important checks</h2><div className="grid3"><article className="glass card"><h3>Match the network</h3><p className="muted">TRC20, BEP20 and Solana are different networks. A transfer on the wrong network may be unrecoverable.</p></article><article className="glass card"><h3>Respect the timer</h3><p className="muted">Quotes expire after the period displayed in the wallet. Create a new quote instead of paying an expired one.</p></article><article className="glass card"><h3>Keep proof</h3><p className="muted">Save the transaction hash. It is the safest reference for a payment review or support request.</p></article></div></section>
    <section style={{ marginTop: 38 }}><h2>Common questions</h2>{faq.map((item) => <article className="glass card" key={item.q} style={{ marginTop: 12 }}><h3>{item.q}</h3><p className="muted">{item.a}</p></article>)}</section>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}><Link className="btn primary" href="/register">Create an account</Link><Link className="btn" href="/payments">All payment methods</Link><Link className="btn" href="/contact">Payment support</Link></div>
  </main><SiteFooter /></>;
}
