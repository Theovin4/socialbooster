import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { adminDb } from "@/lib/firebase/admin";
import { isFirestoreQuotaError } from "@/lib/firebase/errors";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Services", description: "Browse approved social media marketing services with clear limits, support options and transparent pricing." };
export const dynamic = "force-dynamic";

type CatalogService = { id: string; name: string; categoryName: string; minQuantity: number; maxQuantity: number; refillSupported: boolean; cancelSupported: boolean; sellingRateMinor: number; providerCurrency: string };

export default async function Services({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const normalized = q.trim().toLowerCase();
  let services: CatalogService[] = [];
  let quotaExhausted = false;

  try {
    const snapshot = await adminDb().collection("services").where("active", "==", true).limit(200).get();
    services = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as CatalogService))
      .filter((item) => !normalized || item.name.toLowerCase().includes(normalized) || item.categoryName.toLowerCase().includes(normalized));
  } catch (error) {
    if (!isFirestoreQuotaError(error)) throw error;
    quotaExhausted = true;
  }

  return <><SiteHeader /><main className="shell" style={{ minHeight: "65vh", padding: "80px 0" }}><span className="eyebrow">Approved catalog</span><h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)", letterSpacing: "-.055em", margin: "14px 0" }}>Find the right service.</h1><p className="muted" style={{ fontSize: 18, maxWidth: 720, lineHeight: 1.7 }}>Only services reviewed and approved by Social Booster appear here. Prices shown are per 1,000 units and use the configured gross margin.</p><form style={{ display: "flex", gap: 10, maxWidth: 760, margin: "32px 0" }}><input className="field" name="q" defaultValue={q} aria-label="Search approved services" placeholder="Search a platform, category, or service" /><button className="btn primary">Search</button></form>{quotaExhausted ? <div className="glass card"><h2>Catalog temporarily unavailable</h2><p className="muted">We are restoring database access. Please check again shortly.</p></div> : services.length === 0 ? <div className="glass card"><h2>No approved services found</h2><p className="muted">The catalog is being reviewed. Check again soon or try a different search.</p></div> : <div style={{ display: "grid", gap: 14 }}>{services.map((service) => <article className="glass card" key={service.id}><div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}><div><p className="eyebrow" style={{ margin: 0 }}>{service.categoryName}</p><h2 style={{ fontSize: 20, margin: "9px 0" }}>{service.name}</h2><p className="muted" style={{ margin: 0 }}>Min {service.minQuantity.toLocaleString()} · Max {service.maxQuantity.toLocaleString()} · Refill {service.refillSupported ? "Available" : "Not available"} · Cancellation {service.cancelSupported ? "Supported" : "Not supported"}</p></div><div style={{ textAlign: "right" }}><strong style={{ fontSize: 25 }}>{formatMoney(BigInt(service.sellingRateMinor), service.providerCurrency || "USD")}</strong><p className="muted" style={{ margin: "5px 0 12px" }}>per 1,000</p><Link className="btn" href={`/services/${service.id}`}>View details</Link></div></div></article>)}</div>}</main><SiteFooter /></>;
}
