import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { isFirestoreQuotaError } from "@/lib/firebase/errors";
import { isProviderKey, type ProviderKey } from "@/lib/providers";
import { FieldPath } from "firebase-admin/firestore";
import Link from "next/link";
import { approveService, setServiceGovernance, setServicePriceOverride, syncAllServices } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const syncMessages: Record<string, { title: string; body: string; color: string }> = {
  success: { title: "Synchronization complete", body: "The service catalogue, counts and customer prices have been updated.", color: "#86efac" },
  quota: { title: "Firebase limit reached", body: "Your existing services are safe. Wait for the daily Firebase allowance to reset, then try again.", color: "#fbbf24" },
  timeout: { title: "Connection timed out", body: "The connection responded too slowly. Existing services remain available and the scheduled synchronization can retry later.", color: "#fbbf24" },
  format: { title: "Catalogue response needs attention", body: "The connection returned an unexpected service list. Existing services remain available.", color: "#fbbf24" },
  failed: { title: "Synchronization did not finish", body: "No existing services were removed. Please try once more or check Live Orders for the connection status.", color: "#fca5a5" },
};

type AdminServiceFilters = { after?: string; filter?: string; category?: string };

function safeCursor(value?: string) {
  return value && /^(?:\d+|(?:followspanel|nitro|smmworld)_[A-Za-z0-9_-]+)$/.test(value) ? value : "";
}

async function loadServices(providerKey: ProviderKey, filters: AdminServiceFilters) {
  try {
    const db = adminDb();
    let query: FirebaseFirestore.Query = db.collection("services").where("providerKey", "==", providerKey);
    if (filters.category?.trim()) query = query.where("categoryName", "==", filters.category.trim().slice(0, 120));
    else if (filters.filter === "active") query = query.where("active", "==", true);
    else if (filters.filter === "inactive") query = query.where("active", "==", false);
    else if (["published", "hidden", "review"].includes(filters.filter || "")) query = query.where("publicStatus", "==", filters.filter);
    else if (filters.filter === "anomaly") query = query.where("belowMinimumMargin", "==", true);
    else if (filters.filter === "compliance") query = query.where("flaggedForReview", "==", true);
    query = query.orderBy(FieldPath.documentId()).limit(50);
    const after = safeCursor(filters.after);
    if (after) query = query.startAfter(after);
    const snapshot = await query.get();
    const providers = snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
    return {
      quotaExhausted: false as const,
      providers,
      approvedMap: new Map(providers.map((doc) => [doc.id, doc.data])),
      nextCursor: snapshot.size === 50 ? snapshot.docs.at(-1)?.id || null : null,
    };
  } catch (error) {
    if (!isFirestoreQuotaError(error)) throw error;
    return { quotaExhausted: true as const };
  }
}

export default async function AdminServices({ searchParams }: { searchParams: Promise<{ provider?: string; sync?: string; after?: string; filter?: string; category?: string }> }) {
  const input = await searchParams;
  const requestedProvider = input.provider;
  const providerKey: ProviderKey = isProviderKey(requestedProvider) ? requestedProvider : "followspanel";
  const result = await loadServices(providerKey, input);
  if (result.quotaExhausted) {
    return <AppShell admin><span className="eyebrow">Catalog control</span><h1 style={{ fontSize: 42 }}>Service approvals</h1><div className="glass card" style={{ marginTop: 28 }}><h2>Firebase quota temporarily exhausted</h2><p className="muted">The catalog is safe, but Firebase has paused database access for this project. Upgrade the Firebase project to Blaze or wait for the daily quota to reset, then reload this page.</p></div></AppShell>;
  }

  return (
    <AppShell admin>
        <span className="eyebrow">Catalog control</span>
        <h1 style={{ fontSize: 42 }}>Service approvals</h1>
        <p className="muted" style={{ maxWidth: 760, lineHeight: 1.7 }}>
          Synchronization never changes your approval decisions. Review each service carefully before making it visible to customers. Showing 50 services per page.
        </p>
        {input.sync && syncMessages[input.sync] ? <div className="glass card" role="status" style={{ marginTop: 18, borderColor: syncMessages[input.sync].color }}><strong style={{ color: syncMessages[input.sync].color }}>{syncMessages[input.sync].title}</strong><p className="muted" style={{ marginBottom: 0 }}>{syncMessages[input.sync].body}</p></div> : null}
        <form action={syncAllServices} style={{ marginTop: 18 }}><input type="hidden" name="provider" value={providerKey} /><button className="btn primary">Synchronize selected connection</button></form>
        <nav aria-label="Service connection" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
          {([["followspanel", "Followpanel"], ["nitro", "Nitro NG"], ["smmworld", "SMM World"]] as const).map(([key, label]) => (
            <Link className={`btn ${providerKey === key ? "primary" : ""}`} href={`/admin/services?provider=${key}`} key={key}>{label}</Link>
          ))}
        </nav>
        <form className="glass card" style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
          <input type="hidden" name="provider" value={providerKey} />
          <select className="field" name="filter" defaultValue={input.filter || ""}><option value="">All services</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="review">Needs review</option><option value="anomaly">Price anomaly</option><option value="compliance">Compliance flag</option></select>
          <input className="field" name="category" defaultValue={input.category || ""} placeholder="Exact category" />
          <button className="btn">Apply filters</button>
        </form>
        <div style={{ display: "grid", gap: 12, marginTop: 28 }}>
          {result.providers.length === 0 ? (
            <div className="glass card"><h2>No provider services found</h2><p className="muted">Run the protected service synchronization first, then refresh this page.</p></div>
          ) : result.providers.map((doc) => {
            const provider = doc.data;
            const local = result.approvedMap.get(doc.id);
            const active = local?.active === true;
            return (
              <article className="glass card" key={doc.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 20, alignItems: "center" }}>
                <div>
                  <p className="eyebrow" style={{ margin: 0 }}>{provider.categoryName}</p>
                  <h2 style={{ fontSize: 18, margin: "8px 0" }}>{provider.name}</h2>
                  {local?.publicName ? <p style={{ margin: "0 0 8px" }}><strong>Public name:</strong> {String(local.publicName)}</p> : null}
                  <p className="muted" style={{ margin: 0 }}>{provider.providerLabel || "Followpanel"} · ID {provider.providerServiceId || doc.id} · Cost {provider.providerCurrency || "NGN"} {provider.rateText}/1,000 · Min {provider.minQuantity} · Max {provider.maxQuantity} · Refill {provider.refillSupported ? "Yes" : "No"} · Cancel {provider.cancelSupported ? "Yes" : "No"}</p>
                  {local ? <p className="muted" style={{ margin: "8px 0 0" }}>Public: {active ? "Published" : "Hidden"} · Featured: {local.featured ? "Yes" : "No"} · Search index: {local.seoEligible ? "Approved" : "Noindex"} · Ads: {local.paidAdsEligible ? "Eligible" : "Not approved"} · Review flag: {local.flaggedForReview ? "Yes" : "No"}</p> : null}
                </div>
                {local ? (
                  <div style={{ display: "grid", gap: 8, minWidth: 210 }}>
                    <form action={setServicePriceOverride}><input type="hidden" name="id" value={doc.id} /><button className="btn" style={{ width: "100%" }}>Reset to 40% gross margin</button></form>
                    {local.belowMinimumMargin ? <small style={{ color: "#fbbf24" }}>Warning: this override is below the configured minimum margin.</small> : null}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
                      {[
                        [active ? "unpublish" : "publish", active ? "Unpublish" : "Publish"],
                        [local.featured ? "unfeature" : "feature", local.featured ? "Unfeature" : "Feature"],
                        [local.flaggedForReview ? "clear_flag" : "flag", local.flaggedForReview ? "Clear flag" : "Flag review"],
                        [local.seoEligible ? "seo_off" : "seo_on", local.seoEligible ? "Noindex" : "Approve SEO"],
                        [local.paidAdsEligible ? "ads_off" : "ads_on", local.paidAdsEligible ? "Remove ads" : "Ads eligible"],
                      ].map(([operation, label]) => <form action={setServiceGovernance} key={operation}><input type="hidden" name="id" value={doc.id} /><input type="hidden" name="operation" value={operation} /><button className="btn" style={{ width: "100%", paddingInline: 8 }}>{label}</button></form>)}
                    </div>
                  </div>
                ) : (
                  <form action={approveService}><input type="hidden" name="id" value={doc.id} /><button className="btn primary">Approve at 40% gross margin</button></form>
                )}
              </article>
            );
          })}
        </div>
        {result.nextCursor ? <div style={{ marginTop: 20 }}><Link className="btn" href={`/admin/services?${new URLSearchParams({ provider: providerKey, ...(input.filter ? { filter: input.filter } : {}), ...(input.category ? { category: input.category } : {}), after: result.nextCursor }).toString()}`}>Next 50 services</Link></div> : null}
    </AppShell>
  );
}
