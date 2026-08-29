import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { adminDb } from "@/lib/firebase/admin";
import { isFirestoreQuotaError } from "@/lib/firebase/errors";
import { serviceSellingRateNgnMinor } from "@/lib/currency";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
type Service = { id: string; name: string; category: string; min: number; max: number; refill: boolean; rate: number };

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }): Promise<Metadata> {
  const { q = "" } = await searchParams;
  return {
    title: "Social Media Marketing Services in Nigeria",
    description: "Compare Instagram, TikTok, YouTube, Facebook and other social media marketing services with clear Nigerian naira prices, limits and support options.",
    alternates: { canonical: "/services" },
    robots: q.trim() ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { title: "Social Media Marketing Services in Nigeria", description: "Browse current social media service options and transparent NGN pricing.", url: "/services" },
  };
}

export default async function Services({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const needle = q.trim().toLowerCase();
  let services: Service[] = [];
  let unavailable = false;
  try {
    const snapshot = await adminDb().collection("services").where("active", "==", true).get();
    services = snapshot.docs.map((doc) => {
      const item = doc.data();
      return {
        id: doc.id,
        name: String(item.name),
        category: String(item.categoryName),
        min: Number(item.minQuantity),
        max: Number(item.maxQuantity),
        refill: item.refillSupported === true,
        rate: Number(serviceSellingRateNgnMinor(item)),
      };
    }).filter((item) => !needle || `${item.id} ${item.name} ${item.category}`.toLowerCase().includes(needle))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  } catch (error) {
    if (!isFirestoreQuotaError(error)) throw error;
    unavailable = true;
  }
  const groups = services.reduce((result, item) => {
    const current = result.get(item.category) || [];
    current.push(item);
    result.set(item.category, current);
    return result;
  }, new Map<string, Service[]>());

  return <><SiteHeader /><main className="shell" style={{ minHeight: "68vh", padding: "78px 0" }}>
    <span className="eyebrow">Social media services in Nigeria</span>
    <h1 style={{ fontSize: "clamp(2.7rem,7vw,5rem)", letterSpacing: "-.055em", margin: "14px 0" }}>Compare services and prices in naira.</h1>
    <p className="muted page-lead">Explore current Instagram, TikTok, YouTube, Facebook and other social media marketing options. Compare service details, prices, order limits and refill availability before choosing.</p>
    <form className="glass" action="/services" style={{ display: "flex", gap: 10, maxWidth: 820, margin: "32px 0", padding: 10, borderRadius: 16 }}>
      <input className="field" name="q" defaultValue={q} aria-label="Search services" placeholder="Search platform, category, service or ID" />
      <button className="btn primary">Search</button>
    </form>
    {unavailable ? <div className="glass card"><h2>Catalog temporarily unavailable</h2><p className="muted">Please check again shortly.</p></div> : services.length === 0 ? <div className="glass card"><h2>No services found</h2><p className="muted">Try a different search.</p></div> : <>
      <p className="muted">{services.length.toLocaleString("en-NG")} services across {groups.size.toLocaleString("en-NG")} categories</p>
      {Array.from(groups.entries()).map(([category, items]) => <section className="catalog-group" key={category}>
        <h2 className="catalog-title">{category} <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>· {items.length} services</span></h2>
        <div className="glass data-table-wrap catalog-table" style={{ borderRadius: "0 0 18px 18px" }}><table className="data-table"><thead><tr><th>ID</th><th>Service</th><th>Rate / 1,000</th><th>Minimum</th><th>Maximum</th><th>Refill</th><th></th></tr></thead><tbody>
          {items.map((item) => <tr key={item.id}><td>{item.id}</td><td style={{ maxWidth: 480 }}><Link href={`/services/${item.id}`}>{item.name}</Link></td><td><strong>{formatMoney(BigInt(item.rate), "NGN")}</strong></td><td>{item.min.toLocaleString("en-NG")}</td><td>{item.max.toLocaleString("en-NG")}</td><td>{item.refill ? "Available" : "—"}</td><td><Link className="btn" href={`/services/${item.id}`}>Details</Link></td></tr>)}
        </tbody></table></div>
        <div className="mobile-service-list">{items.map((item) => <article className="glass card" key={item.id}><span className="eyebrow">ID {item.id}</span><h3 style={{ lineHeight: 1.45 }}><Link href={`/services/${item.id}`}>{item.name}</Link></h3><strong style={{ fontSize: 21 }}>{formatMoney(BigInt(item.rate), "NGN")} / 1,000</strong><p className="muted">Min {item.min.toLocaleString("en-NG")} · Max {item.max.toLocaleString("en-NG")} · Refill {item.refill ? "Yes" : "No"}</p><Link className="btn primary" href={`/services/${item.id}`}>View service details</Link></article>)}</div>
      </section>)}
    </>}
  </main><SiteFooter /></>;
}
