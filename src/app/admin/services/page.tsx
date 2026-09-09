import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { isFirestoreQuotaError } from "@/lib/firebase/errors";
import { isProviderKey, type ProviderKey } from "@/lib/providers";
import { FieldPath } from "firebase-admin/firestore";
import Link from "next/link";
import { approveService, setServiceActive, setServicePriceOverride, syncAllServices } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const syncMessages: Record<string, { title: string; body: string; color: string }> = {
  success: { title: "Synchronization complete", body: "The service catalogue, counts and customer prices have been updated.", color: "#86efac" },
  quota: { title: "Firebase limit reached", body: "Your existing services are safe. Wait for the daily Firebase allowance to reset, then try again.", color: "#fbbf24" },
  timeout: { title: "Connection timed out", body: "The connection responded too slowly. Existing services remain available and the scheduled synchronization can retry later.", color: "#fbbf24" },
  format: { title: "Catalogue response needs attention", body: "The connection returned an unexpected service list. Existing services remain available.", color: "#fbbf24" },
  failed: { title: "Synchronization did not finish", body: "No existing services were removed. Please try once more or check Live Orders for the connection status.", color: "#fca5a5" },
};

async function loadServices(providerKey: ProviderKey) {
  try {
    const db = adminDb();
    const legacy = providerKey === "followspanel";
    const [providers, approved] = await Promise.all(legacy ? [
      db.collection("providerServices").orderBy(FieldPath.documentId()).limit(250).get(),
      db.collection("services").orderBy(FieldPath.documentId()).limit(250).get(),
    ] : [
      db.collection("providerServices").where("providerKey", "==", providerKey).limit(200).get(),
      db.collection("services").where("providerKey", "==", providerKey).limit(200).get(),
    ]);
    const belongs = (id: string, data: FirebaseFirestore.DocumentData) => legacy ? /^\d+$/.test(id) : data.providerKey === providerKey;
    return {
      quotaExhausted: false as const,
      providers: providers.docs.filter((doc) => belongs(doc.id, doc.data())).map((doc) => ({ id: doc.id, data: doc.data() })).sort((a, b) => String(a.data.categoryName).localeCompare(String(b.data.categoryName))),
      approvedMap: new Map(approved.docs.filter((doc) => belongs(doc.id, doc.data())).map((doc) => [doc.id, doc.data()])),
    };
  } catch (error) {
    if (!isFirestoreQuotaError(error)) throw error;
    return { quotaExhausted: true as const };
  }
}

export default async function AdminServices({ searchParams }: { searchParams: Promise<{ provider?: string; sync?: string }> }) {
  const input = await searchParams;
  const requestedProvider = input.provider;
  const providerKey: ProviderKey = isProviderKey(requestedProvider) ? requestedProvider : "followspanel";
  const result = await loadServices(providerKey);
  if (result.quotaExhausted) {
    return <AppShell admin><span className="eyebrow">Catalog control</span><h1 style={{ fontSize: 42 }}>Service approvals</h1><div className="glass card" style={{ marginTop: 28 }}><h2>Firebase quota temporarily exhausted</h2><p className="muted">The catalog is safe, but Firebase has paused database access for this project. Upgrade the Firebase project to Blaze or wait for the daily quota to reset, then reload this page.</p></div></AppShell>;
  }

  return (
    <AppShell admin>
        <span className="eyebrow">Catalog control</span>
        <h1 style={{ fontSize: 42 }}>Service approvals</h1>
        <p className="muted" style={{ maxWidth: 760, lineHeight: 1.7 }}>
          Synchronization never changes your approval decisions. Review each service carefully before making it visible to customers. Showing up to 200 services from the selected connection.
        </p>
        {input.sync && syncMessages[input.sync] ? <div className="glass card" role="status" style={{ marginTop: 18, borderColor: syncMessages[input.sync].color }}><strong style={{ color: syncMessages[input.sync].color }}>{syncMessages[input.sync].title}</strong><p className="muted" style={{ marginBottom: 0 }}>{syncMessages[input.sync].body}</p></div> : null}
        <form action={syncAllServices} style={{ marginTop: 18 }}><input type="hidden" name="provider" value={providerKey} /><button className="btn primary">Synchronize selected connection</button></form>
        <nav aria-label="Service connection" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
          {([["followspanel", "Followpanel"], ["nitro", "Nitro NG"], ["smmworld", "SMM World"]] as const).map(([key, label]) => (
            <Link className={`btn ${providerKey === key ? "primary" : ""}`} href={`/admin/services?provider=${key}`} key={key}>{label}</Link>
          ))}
        </nav>
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
                  <p className="muted" style={{ margin: 0 }}>{provider.providerLabel || "Followpanel"} · ID {provider.providerServiceId || doc.id} · Cost {provider.providerCurrency || "NGN"} {provider.rateText}/1,000 · Min {provider.minQuantity} · Max {provider.maxQuantity} · Refill {provider.refillSupported ? "Yes" : "No"} · Cancel {provider.cancelSupported ? "Yes" : "No"}</p>
                </div>
                {local ? (
                  <div style={{ display: "grid", gap: 8, minWidth: 210 }}>
                    <form action={setServicePriceOverride}><input type="hidden" name="id" value={doc.id} /><button className="btn" style={{ width: "100%" }}>Reset to provider price + 40%</button></form>
                    {local.belowMinimumMargin ? <small style={{ color: "#fbbf24" }}>Warning: this override is below the configured minimum margin.</small> : null}
                    <form action={setServiceActive}><input type="hidden" name="id" value={doc.id} /><input type="hidden" name="active" value={active ? "false" : "true"} /><button className={`btn ${active ? "" : "primary"}`} style={{ width: "100%" }}>{active ? "Disable" : "Enable"}</button></form>
                  </div>
                ) : (
                  <form action={approveService}><input type="hidden" name="id" value={doc.id} /><button className="btn primary">Approve at provider price + 40%</button></form>
                )}
              </article>
            );
          })}
        </div>
    </AppShell>
  );
}
