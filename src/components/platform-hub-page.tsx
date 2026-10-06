import Link from "next/link";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { formatMoney } from "@/lib/money";
import { getServiceCatalogPage } from "@/lib/service-catalog";
import type { PlatformHub } from "@/lib/platform-hubs";

export async function PlatformHubPage({ hub }: { hub: PlatformHub }) {
  const result = await getServiceCatalogPage({ query: hub.name, page: 1, pageSize: 10 }).catch(() => null);
  const examples = result?.items.slice(0, 6) || [];
  const siteUrl = "https://www.socialbooster.net.ng";
  const faq = [
    { question: `How do I choose a ${hub.name} service?`, answer: "Compare the service name, order limits, price and support options. Open the detail page and follow its link requirements before ordering." },
    { question: "How is the price calculated?", answer: "The catalogue shows the current customer rate per 1,000. Your exact charge is calculated from the quantity selected before confirmation." },
    { question: "Can I track an order?", answer: "Yes. Signed-in customers can view current status, start count and remaining quantity from the order page when those values are supplied." },
  ];
  const schema = { "@context": "https://schema.org", "@graph": [{ "@type": "CollectionPage", name: `${hub.name} Services`, url: `${siteUrl}/${hub.slug}`, description: hub.overview }, { "@type": "FAQPage", mainEntity: faq.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) }] };
  return <><SiteHeader /><main className="shell" style={{ minHeight: "68vh", padding: "78px 0" }}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <span className="eyebrow">{hub.name} services</span>
    <h1 className="page-heading">{hub.name} services with clear ordering information.</h1>
    <p className="muted page-lead">{hub.overview}</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 26 }}>{hub.categories.map((item) => <span className="glass" style={{ padding: "10px 14px", borderRadius: 999 }} key={item}>{item}</span>)}</div>
    <section style={{ marginTop: 46 }}><span className="eyebrow">Current catalogue examples</span><h2>Compare available options</h2>
      {examples.length ? <div className="grid3">{examples.map((service) => <article className="glass card" key={service.id}><span className="eyebrow">{service.category}</span><h3>{service.name}</h3><p><strong>{formatMoney(BigInt(service.rateMinor), "NGN")}</strong> / 1,000</p><p className="muted">Min {service.min.toLocaleString("en-NG")} · Max {service.max.toLocaleString("en-NG")}</p><Link className="btn" href={`/services/${service.id}`}>View details</Link></article>)}</div> : <div className="glass card"><p className="muted">Current options are available in the complete catalogue.</p></div>}
      <Link className="btn primary" href={`/services?q=${encodeURIComponent(hub.name)}`} style={{ marginTop: 20 }}>Browse all {hub.name} services</Link>
    </section>
    <section className="form-grid" style={{ marginTop: 46 }}><article className="glass card"><span className="eyebrow">How ordering works</span><h2>Review, fund, order and track</h2><ol className="muted" style={{ lineHeight: 1.9 }}><li>Create an account and fund your wallet.</li><li>Choose a service and confirm the link and quantity.</li><li>Review the calculated charge before submitting.</li><li>Track progress from your order page.</li></ol></article><article className="glass card"><span className="eyebrow">Important limitations</span><h2>Choose with accurate expectations</h2><p className="muted" style={{ lineHeight: 1.8 }}>{hub.limitations}</p></article></section>
    <section style={{ marginTop: 46 }}><span className="eyebrow">Related guidance</span><h2>Plan the wider marketing work</h2><div className="grid3">{hub.guides.map((guide) => <Link className="glass card" href={`/blog/${guide.slug}`} key={guide.slug}>{guide.label} →</Link>)}</div></section>
    <section className="glass card" style={{ marginTop: 46 }}><span className="eyebrow">Frequently asked questions</span>{faq.map((item) => <div key={item.question} style={{ borderTop: "1px solid var(--line)", paddingTop: 18, marginTop: 18 }}><h3>{item.question}</h3><p className="muted">{item.answer}</p></div>)}</section>
  </main><SiteFooter /></>;
}
