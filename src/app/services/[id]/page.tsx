import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { adminDb } from "@/lib/firebase/admin";
import { serviceSellingRateNgnMinor } from "@/lib/currency";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
type Service = { name: string; description?: string; categoryName: string; type: string; minQuantity: number; maxQuantity: number; refillSupported: boolean; cancelSupported: boolean; sellingRateMinor: number; sellingCurrency?: string; active: boolean };
const getService = cache(async (id: string) => { if (!/^\d+$/.test(id)) return null; const snapshot = await adminDb().collection("services").doc(id).get(); if (!snapshot.exists || snapshot.data()?.active !== true) return null; return snapshot.data() as Service; });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const service = await getService(id);
  return service ? { title: `${service.name} | Social Media Service`, description: `View the current naira price, order limits and support options for ${service.name}. Available to eligible customers in Nigeria and across Africa.`, alternates: { canonical: `/services/${id}` }, openGraph: { title: service.name, description: `Compare the price and order requirements for this ${service.categoryName} service.` } } : { title: "Service not found", robots: { index: false } };
}

export default async function ServiceDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = await getService(id);
  if (!service) notFound();
  const sellingRateMinor = Number(serviceSellingRateNgnMinor(service as Service & { providerRateMinor: number; pricingModel?: string; markupBps?: number }));
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://socialbooster-sigma.vercel.app";
  const schema = { "@context": "https://schema.org", "@type": "Service", name: service.name, description: `Online ${service.categoryName} service with clear order limits and naira pricing.`, serviceType: service.categoryName, areaServed: [{ "@type": "Country", name: "Nigeria" }, { "@type": "Continent", name: "Africa" }], provider: { "@type": "Organization", name: "Social Booster", url: siteUrl }, offers: { "@type": "Offer", price: (sellingRateMinor / 100).toFixed(2), priceCurrency: "NGN", url: `${siteUrl}/services/${id}`, availability: "https://schema.org/InStock" } };
  return <><SiteHeader /><main className="shell" style={{ minHeight: "65vh", padding: "80px 0" }}><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} /><Link href="/services" className="muted">← Back to all services</Link><p className="eyebrow" style={{ marginTop: 34 }}>{service.categoryName} · Service {id}</p><h1 style={{ fontSize: "clamp(2.3rem,6vw,4.6rem)", letterSpacing: "-.05em", maxWidth: 900 }}>{service.name}</h1><p className="muted page-lead">Review the price, order range and available support before placing your order.</p><div className="grid3" style={{ marginTop: 34 }}><div className="glass card"><p className="muted">Price per 1,000</p><strong style={{ fontSize: 30 }}>{formatMoney(BigInt(sellingRateMinor), "NGN")}</strong></div><div className="glass card"><p className="muted">Quantity range</p><strong>{service.minQuantity.toLocaleString("en-NG")}–{service.maxQuantity.toLocaleString("en-NG")}</strong></div><div className="glass card"><p className="muted">Order support</p><strong>Refill: {service.refillSupported ? "Available" : "Not included"}<br />Cancellation: {service.cancelSupported ? "When eligible" : "Not available"}</strong></div></div><div className="glass card" style={{ marginTop: 20, maxWidth: 900 }}><h2>Before you order</h2><p className="muted" style={{ lineHeight: 1.7 }}>{service.description || "Use the correct public link for the selected social platform. Check the quantity range and make sure your intended use complies with the platform's rules. Delivery characteristics vary by service."}</p><Link className="btn primary" href={`/dashboard/new-order?service=${id}`}>Choose this service</Link></div></main><SiteFooter /></>;
}
