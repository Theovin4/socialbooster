import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { formatMoney } from "@/lib/money";
import { getPublicServiceDetails } from "@/lib/public-service-details";
import { resolveServiceIdentifier } from "@/lib/service-catalog";

export const dynamic = "force-dynamic";
const getService = cache(async (identifier: string) => {
  const match = await resolveServiceIdentifier(identifier);
  if (!match) return null;
  const details = await getPublicServiceDetails(match);
  return {
    service: {
      name: match.name,
      shortDescription: details.shortDescription,
      fullDescription: details.fullDescription,
      descriptionSource: details.descriptionSource,
      categoryName: match.category,
      type: match.type,
      minQuantity: match.min,
      maxQuantity: match.max,
      refillSupported: match.refill,
      cancelSupported: match.cancel,
      sellingRateMinor: match.rateMinor,
      semantics: match.semantics,
    },
    publicId: match.id,
    seoEligible: match.seoEligible,
  };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await getService(id);
  return result ? { title: `${result.service.name} | Social Media Service`, description: result.service.shortDescription, alternates: { canonical: `/services/${result.publicId}` }, robots: { index: result.seoEligible, follow: true }, openGraph: { title: result.service.name, description: result.service.shortDescription, url: `/services/${result.publicId}` } } : { title: "Service not found", robots: { index: false } };
}

export default async function ServiceDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getService(id);
  if (!result) notFound();
  const { service, publicId } = result;
  const sellingRateMinor = service.sellingRateMinor;
  const siteUrl = "https://www.socialbooster.net.ng";
  const schema = { "@context": "https://schema.org", "@graph": [{ "@type": "Service", name: service.name, description: service.fullDescription, serviceType: service.categoryName, areaServed: service.semantics.region || "Worldwide", provider: { "@id": `${siteUrl}/#organization` }, offers: { "@type": "Offer", price: (sellingRateMinor / 100).toFixed(2), priceCurrency: "NGN", url: `${siteUrl}/services/${publicId}`, availability: "https://schema.org/InStock" } }, { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` }, { "@type": "ListItem", position: 2, name: "Services", item: `${siteUrl}/services` }, { "@type": "ListItem", position: 3, name: service.name, item: `${siteUrl}/services/${publicId}` }] }] };
  const attributes = [
    ["Platform", service.semantics.platform], ["Service type", service.semantics.kind], ["Variant", service.semantics.variant],
    ["Target", service.semantics.target || service.semantics.scope], ["Region", service.semantics.region],
    ["Reaction type", service.semantics.reactionEmojis?.join(" ") || service.semantics.reactionPolarity], ["Required link", service.semantics.linkType],
  ].filter((entry): entry is string[] => Boolean(entry[1]));
  return <><SiteHeader /><main className="shell" style={{ minHeight: "65vh", padding: "80px 0" }}><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} /><Link href="/services" className="muted">← Back to all services</Link><p className="eyebrow" style={{ marginTop: 34 }}>{service.categoryName} · Service {publicId}</p><h1 style={{ fontSize: "clamp(2.3rem,6vw,4.6rem)", letterSpacing: "-.05em", maxWidth: 900 }}>{service.name}</h1><p className="muted page-lead">{service.shortDescription}</p><div className="glass card" style={{ marginTop: 24, maxWidth: 900 }}><h2>Full service description</h2><p className="muted full-service-description">{service.fullDescription}</p>{service.descriptionSource === "generated_fallback" ? <p className="muted"><small>The provider did not supply additional details, so this factual summary was generated from the service catalogue.</small></p> : null}</div><div className="grid3" style={{ marginTop: 34 }}><div className="glass card"><p className="muted">Price per 1,000</p><strong style={{ fontSize: 30 }}>{formatMoney(BigInt(sellingRateMinor), "NGN")}</strong></div><div className="glass card"><p className="muted">Quantity range</p><strong>{service.minQuantity.toLocaleString("en-NG")}–{service.maxQuantity.toLocaleString("en-NG")}</strong></div><div className="glass card"><p className="muted">Order support</p><strong>Refill: {service.refillSupported ? "Available" : "Not included"}<br />Cancellation: {service.cancelSupported ? "When eligible" : "Not available"}</strong></div></div><div className="glass card" style={{ marginTop: 20, maxWidth: 900 }}><h2>Service details</h2><dl className="service-attributes">{attributes.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><Link className="btn primary" href={`/dashboard/new-order?service=${publicId}`}>Choose this service</Link></div></main><SiteFooter /></>;
}
