import { notFound } from "next/navigation";
import { getMarketingOverview } from "@/lib/marketing-admin";
import { marketingSegments, marketingTemplates, marketingTopics, marketingSendingEnabled } from "@/lib/marketing";
import { resendMarketingConfiguration } from "@/lib/resend-marketing";
import { cancelCampaign, createProviderDraft, saveCampaignDraft, scheduleCampaign, sendCampaignTest } from "../actions";

export const dynamic = "force-dynamic";
const sections = new Set(["campaigns", "create", "templates", "audiences", "automations", "analytics", "suppression", "preferences", "settings"]);

export default async function EmailMarketingSection({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { section } = await params;
  const query = await searchParams;
  if (!sections.has(section)) notFound();
  // Static sections do not touch Firestore. Only pages that display live
  // audience or campaign data load the five-minute cached aggregates.
  const overview = ["campaigns", "audiences", "suppression"].includes(section) ? await getMarketingOverview() : null;
  const provider = resendMarketingConfiguration();

  if (section === "create") return <>
    <span className="eyebrow">Review-only workflow</span><h1 className="page-heading">Create campaign draft</h1>
    {query.notice === "invalid" ? <div className="notice">Review the required fields and try again.</div> : null}
    <form action={saveCampaignDraft} className="glass card form-grid">
      <label>Campaign name<input className="field" name="name" required minLength={3} /></label>
      <label>Template<select className="field" name="templateId">{marketingTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
      <label>Audience<select className="field" name="segment">{marketingSegments.map((segment) => <option key={segment.id} value={segment.id}>{segment.label}</option>)}</select></label>
      <label>Email category<select className="field" name="topic"><option value="">General marketing</option>{marketingTopics.map((topic) => <option key={topic.id} value={topic.id}>{topic.label}</option>)}</select></label>
      <label>Subject<input className="field" name="subject" required maxLength={120} /></label>
      <label className="form-span">Preheader<input className="field" name="preheader" maxLength={180} /></label>
      <label className="form-span">Heading<input className="field" name="heading" required maxLength={120} /></label>
      <label className="form-span">Message<textarea className="field" name="body" rows={7} required minLength={10} maxLength={2000} /></label>
      <label>Button text<input className="field" name="ctaText" required maxLength={60} /></label>
      <label>Button URL<input className="field" name="ctaUrl" defaultValue="/dashboard" required /></label>
      <div className="form-span"><button className="btn primary">Save disabled draft</button></div>
    </form>
  </>;

  if (section === "campaigns") return <>
    <span className="eyebrow">Campaign control</span><h1 className="page-heading">Campaigns</h1>
    {query.notice ? <div className="notice" style={{ marginBottom: 18 }}>{query.notice.replaceAll("-", " ")}</div> : null}
    <div style={{ display: "grid", gap: 14 }}>{overview!.campaigns.length ? overview!.campaigns.map((campaign: Record<string, unknown>) => <article className="glass card" key={String(campaign.id)}>
      <div className="section-head"><div><h2>{String(campaign.name || "Campaign draft")}</h2><p className="muted">{String(campaign.segment).replaceAll("_", " ")} · {Number(campaign.recipientCount || 0).toLocaleString("en-NG")} eligible at draft time</p></div><span className="status-pill">{String(campaign.status)}</span></div>
      <p><strong>{String(campaign.subject)}</strong></p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {campaign.providerBroadcastId ? null : <form action={createProviderDraft}><input type="hidden" name="id" value={String(campaign.id)} /><button className="btn" type="submit">Create Resend draft</button></form>}
        <form action={sendCampaignTest} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input type="hidden" name="id" value={String(campaign.id)} /><input className="field" name="recipient" type="email" placeholder="Approved test recipient" style={{ width: 260 }} /><button className="btn" type="submit">Send test</button></form>
        {campaign.providerBroadcastId && campaign.status === "draft" && marketingSendingEnabled() ? <form action={scheduleCampaign} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><input type="hidden" name="id" value={String(campaign.id)} /><input className="field" name="scheduledAt" type="datetime-local" required style={{ width: 230 }} /><label><input type="checkbox" name="confirmed" value="yes" required /> I reviewed the audience and content</label><label><input type="checkbox" name="largeConfirmed" value="yes" /> I confirm if this reaches 1,000+ recipients</label><button className="btn primary" type="submit">Schedule</button></form> : null}
        {campaign.status !== "cancelled" ? <form action={cancelCampaign}><input type="hidden" name="id" value={String(campaign.id)} /><button className="btn" type="submit">Cancel draft</button></form> : null}
      </div>
    </article>) : <div className="glass card"><h2>No campaigns yet</h2><p className="muted">Create a reviewed draft when you are ready. No campaign is sent automatically.</p></div>}</div>
  </>;

  if (section === "templates") return <><span className="eyebrow">Controlled creative</span><h1 className="page-heading">Templates</h1><div className="grid3">{marketingTemplates.map((template) => <article className="glass card" key={template.id}><h2>{template.name}</h2><p><strong>{template.subject}</strong></p><p className="muted">{template.body}</p></article>)}</div></>;
  if (section === "audiences") return <><span className="eyebrow">Indexed segmentation</span><h1 className="page-heading">Audiences</h1><div className="grid3">{marketingSegments.map((segment) => <article className="glass card" key={segment.id}><h2>{segment.label}</h2><strong className="stat-value">{overview!.counts[segment.id].toLocaleString("en-NG")}</strong><p className="muted">{segment.description}</p></article>)}</div></>;
  if (section === "automations") return <><span className="eyebrow">Lifecycle safeguards</span><h1 className="page-heading">Automations</h1><div className="notice"><strong>All automations are disabled by default.</strong><p className="muted" style={{ marginBottom: 0 }}>Welcome, first-order activation, funded-no-order, reactivation and reseller sequences require an administrator to approve timing, audience and content before activation.</p></div>{["Welcome", "First-order activation", "Funded, no order", "Reactivation", "Reseller and API"].map((name) => <article className="glass card" style={{ marginTop: 14 }} key={name}><div className="section-head"><h2>{name}</h2><span className="status-pill">disabled</span></div><p className="muted">Frequency limits, suppression and consent checks will apply before any future activation.</p></article>)}</>;
  if (section === "analytics") return <><span className="eyebrow">Provider-held reporting</span><h1 className="page-heading">Analytics</h1><div className="grid3">{["Delivery and bounce", "Clicks and unsubscribes", "Orders and revenue", "GA4 and UTM", "Campaign attribution"].map((name) => <article className="glass card" key={name}><h2>{name}</h2><p className="muted">Available after a reviewed campaign is sent. Recipient-level delivery events stay in Resend; the application stores only operational and suppression data.</p></article>)}</div></>;
  if (section === "suppression") return <><span className="eyebrow">Do-not-send controls</span><h1 className="page-heading">Suppression</h1><div className="grid3"><article className="glass card stat-card"><span className="muted">Unsubscribed</span><strong className="stat-value">{overview!.unsubscribed}</strong></article><article className="glass card stat-card"><span className="muted">Bounced, complained or suppressed</span><strong className="stat-value">{overview!.suppressed}</strong></article></div><p className="notice" style={{ marginTop: 22 }}>These statuses are authoritative. Promotional campaigns cannot override them.</p></>;
  if (section === "preferences") return <><span className="eyebrow">Customer control</span><h1 className="page-heading">Preferences</h1><div className="glass card"><h2>Preference centre</h2><p className="muted">Customers can opt in or out from their protected dashboard. Every marketing email also includes Resend&apos;s no-login unsubscribe link.</p></div></>;
  return <><span className="eyebrow">Infrastructure</span><h1 className="page-heading">Email settings</h1><div className="glass card"><h2>Safe defaults</h2><p className="muted">Production marketing: {marketingSendingEnabled() ? "enabled by environment configuration" : "disabled"}. Approved test recipients, Resend segments and topics are configured using server-only environment variables.</p><div className="grid3" style={{ marginTop: 18 }}><div><strong>Sender</strong><p className="muted">{provider.senderConfigured ? "Configured" : "Action required"}</p></div><div><strong>Segments</strong><p className="muted">{provider.configuredSegments.length} of {marketingSegments.length} configured</p></div><div><strong>Topics</strong><p className="muted">{provider.configuredTopics.length} of {marketingTopics.length} configured</p></div></div></div></>;
}
