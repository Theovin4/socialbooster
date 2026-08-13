import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { isFirestoreQuotaError } from "@/lib/firebase/errors";
import { approveService, setServiceActive } from "./actions";

export const dynamic = "force-dynamic";

async function loadServices() {
  try {
    const db = adminDb();
    const [providers, approved] = await Promise.all([
      db.collection("providerServices").orderBy("categoryName").limit(200).get(),
      db.collection("services").get(),
    ]);
    return {
      quotaExhausted: false as const,
      providers: providers.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
      approvedMap: new Map(approved.docs.map((doc) => [doc.id, doc.data()])),
    };
  } catch (error) {
    if (!isFirestoreQuotaError(error)) throw error;
    return { quotaExhausted: true as const };
  }
}

export default async function AdminServices() {
  const result = await loadServices();
  if (result.quotaExhausted) {
    return <AppShell admin><span className="eyebrow">Catalog control</span><h1 style={{ fontSize: 42 }}>Service approvals</h1><div className="glass card" style={{ marginTop: 28 }}><h2>Firebase quota temporarily exhausted</h2><p className="muted">The catalog is safe, but Firebase has paused database access for this project. Upgrade the Firebase project to Blaze or wait for the daily quota to reset, then reload this page.</p></div></AppShell>;
  }

  return (
    <AppShell admin>
        <span className="eyebrow">Catalog control</span>
        <h1 style={{ fontSize: 42 }}>Service approvals</h1>
        <p className="muted" style={{ maxWidth: 760, lineHeight: 1.7 }}>
          Provider synchronization never changes these approval decisions. Review each service carefully before making it visible to customers. Showing the first 200 imported services.
        </p>
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
                  <p className="muted" style={{ margin: 0 }}>ID {doc.id} · Provider rate ${provider.rateText}/1,000 · Min {provider.minQuantity} · Max {provider.maxQuantity} · Refill {provider.refillSupported ? "Yes" : "No"} · Cancel {provider.cancelSupported ? "Yes" : "No"}</p>
                </div>
                {local ? (
                  <form action={setServiceActive}><input type="hidden" name="id" value={doc.id} /><input type="hidden" name="active" value={active ? "false" : "true"} /><button className={`btn ${active ? "" : "primary"}`}>{active ? "Disable" : "Enable"}</button></form>
                ) : (
                  <form action={approveService}><input type="hidden" name="id" value={doc.id} /><button className="btn primary">Approve at 40% margin</button></form>
                )}
              </article>
            );
          })}
        </div>
    </AppShell>
  );
}
