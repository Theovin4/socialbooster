import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/firebase/session";

export const dynamic = "force-dynamic";

const highPriority = ["/", "/services", "/pricing", "/payments", "/payments/crypto", "/resellers", "/api-docs", "/instagram", "/tiktok", "/facebook", "/youtube", "/telegram", "/africa", "/blog"];
const noindex = ["/admin/*", "/dashboard/*", "/api/*", "/login", "/register", "/forgot-password", "/services?q=*", "/services?page=2+"];

export default async function AdminSeoPage() {
  await requireAdmin();
  return <AppShell admin>
    <span className="eyebrow">Organic search operations</span><h1 className="page-heading">Search health</h1><p className="muted page-lead">A low-read operational view of index governance, priority pages and the reports that must be reviewed in Google Search Console.</p>
    <div className="grid3"><article className="glass card stat-card"><span className="muted">Priority URLs</span><strong className="stat-value">{highPriority.length}</strong></article><article className="glass card stat-card"><span className="muted">Sitemap sections</span><strong className="stat-value">5</strong></article><article className="glass card stat-card"><span className="muted">Service indexing rule</span><strong className="stat-value">Approved only</strong></article></div>
    <section className="glass card" style={{ marginTop: 22 }}><h2>High-priority pages</h2><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{highPriority.map((path) => <Link className="btn" href={path} key={path}>{path}</Link>)}</div></section>
    <section className="grid3" style={{ marginTop: 22 }}><article className="glass card"><h2>Index eligible</h2><p className="muted">Canonical public pages, marketing guides, platform hubs and only services approved for SEO.</p></article><article className="glass card"><h2>Noindex</h2><p className="muted">{noindex.join(", ")}</p></article><article className="glass card"><h2>Google reporting</h2><p className="muted">Coverage, Core Web Vitals, rich results and Discover performance remain authoritative in Search Console. This application does not manufacture those values.</p></article></section>
    <section className="glass card" style={{ marginTop: 22 }}><h2>Weekly review</h2><ol className="muted" style={{ lineHeight: 1.9 }}><li>Confirm all five child sitemaps are fetched successfully.</li><li>Inspect exclusions, duplicate canonicals and crawled-not-indexed pages.</li><li>Review queries and landing pages by Nigeria and supported African markets.</li><li>Check mobile Core Web Vitals and Discover only when Search Console provides data.</li><li>Unpublish or remove thin service pages from SEO eligibility instead of mass-submitting them.</li></ol></section>
  </AppShell>;
}
