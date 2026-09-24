import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { NewOrderForm, type OrderService } from "@/components/new-order-form";
import { getServiceCatalogPage } from "@/lib/service-catalog";
import { submitOrder } from "../orders/actions";

export const dynamic = "force-dynamic";

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ service?: string; q?: string; category?: string; page?: string }> }) {
  const input = await searchParams;
  const requestedPage = Math.max(1, Number.parseInt(input.page || "1", 10) || 1);
  const catalog = await getServiceCatalogPage({ query: input.q, category: input.category, page: input.page ? requestedPage : undefined, pageSize: 50, selectedId: input.service });
  const services: OrderService[] = catalog.items.map((item) => ({ id: item.id, name: item.name, category: item.category, min: item.min, max: item.max, rateMinor: item.rateMinor, refill: item.refill, cancel: item.cancel, description: item.description }));
  const selectedId = services.some((item) => item.id === input.service) ? input.service : undefined;
  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    if (input.q?.trim()) params.set("q", input.q.trim());
    if (input.category?.trim()) params.set("category", input.category.trim());
    if (page > 1) params.set("page", String(page));
    return `/dashboard/new-order?${params.toString()}`;
  };
  return <AppShell><h1 className="page-heading">New order</h1><p className="muted page-lead">Find a category or service, review its description, then confirm your order.</p>
    <form method="get" className="glass card" style={{ marginBottom: 20 }}>
      <div className="form-grid"><label>Category<select className="field" name="category" defaultValue={input.category || ""}><option value="">All categories</option>{catalog.categories.map((category) => <option value={category} key={category}>{category}</option>)}</select></label><label>Search services<input className="field" type="search" name="q" defaultValue={input.q || ""} placeholder="Platform, service name or ID" /></label></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}><button className="btn primary" type="submit">Load matching services</button><Link className="btn" href="/dashboard/new-order">Clear filters</Link></div>
    </form>
    {catalog.total ? <><p className="muted">Showing {((catalog.page - 1) * catalog.pageSize + 1).toLocaleString("en-NG")}–{Math.min(catalog.page * catalog.pageSize, catalog.total).toLocaleString("en-NG")} of {catalog.total.toLocaleString("en-NG")} matching services</p><NewOrderForm services={services} selectedId={selectedId} action={submitOrder} />{catalog.totalPages > 1 ? <nav aria-label="Order service pages" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 18 }}><span className="muted">Page {catalog.page.toLocaleString("en-NG")} of {catalog.totalPages.toLocaleString("en-NG")}</span><div style={{ display: "flex", gap: 10 }}>{catalog.page > 1 ? <Link className="btn" href={pageHref(catalog.page - 1)}>Previous</Link> : null}{catalog.page < catalog.totalPages ? <Link className="btn primary" href={pageHref(catalog.page + 1)}>Next</Link> : null}</div></nav> : null}</> : <section className="glass card"><h2>No matching services</h2><p className="muted">Try a shorter search or choose a different category.</p></section>}
  </AppShell>;
}
