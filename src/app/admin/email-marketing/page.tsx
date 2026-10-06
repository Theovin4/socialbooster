import Link from "next/link";
import { getMarketingOverview } from "@/lib/marketing-admin";
import { marketingSendingEnabled, marketingSegments } from "@/lib/marketing";
import { resendMarketingConfiguration } from "@/lib/resend-marketing";

export const dynamic = "force-dynamic";

export default async function EmailMarketingOverview() {
  const overview = await getMarketingOverview();
  const provider = resendMarketingConfiguration();
  return <><span className="eyebrow">Consent-led lifecycle messaging</span><h1 className="page-heading">Email marketing</h1><p className="muted page-lead">Build branded campaigns for subscribed customers without mixing promotional messages into account, payment or order notifications.</p>
    <div className="notice"><strong>{marketingSendingEnabled() ? "Production sending is enabled by configuration." : "Production marketing sends are disabled."}</strong><p className="muted" style={{ marginBottom: 0 }}>New campaigns and automations remain drafts until an administrator reviews the audience, content, provider setup and schedule.</p></div>
    <div className="grid3" style={{ marginTop: 22 }}><article className="glass card stat-card"><span className="muted">Marketing eligible</span><strong className="stat-value">{overview.counts.eligible.toLocaleString("en-NG")}</strong></article><article className="glass card stat-card"><span className="muted">Unsubscribed</span><strong className="stat-value">{overview.unsubscribed.toLocaleString("en-NG")}</strong></article><article className="glass card stat-card"><span className="muted">Suppressed</span><strong className="stat-value">{overview.suppressed.toLocaleString("en-NG")}</strong></article></div>
    <section className="glass card" style={{ marginTop: 22 }}><div className="section-head"><div><span className="eyebrow">Audiences</span><h2>Lifecycle segments</h2></div><Link className="btn primary" href="/admin/email-marketing/create">Create draft</Link></div><div className="grid3">{marketingSegments.slice(1).map((segment) => <article key={segment.id}><strong>{segment.label}</strong><p className="muted">{overview.counts[segment.id].toLocaleString("en-NG")} customers</p></article>)}</div></section>
    <section className="glass card" style={{ marginTop: 22 }}><h2>System readiness</h2><p className="muted">Resend segments: {provider.configuredSegments.length} configured · Preference topics: {provider.configuredTopics.length} configured · Marketing sender: {provider.senderConfigured ? "configured" : "needs configuration"} · Broadcast creation: {provider.configured ? "available for reviewed drafts" : "paused"}.</p></section>
  </>;
}
