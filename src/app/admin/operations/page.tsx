import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";
import { providerDefinitions } from "@/lib/providers";

export const dynamic = "force-dynamic";

const workflows = [
  ["Public homepage", "0", "Static content; no Firestore request."],
  ["Public service catalogue", "0 warm / manifest + bounded chunks cold", "Shared server cache uses immutable public snapshots. No services collection scan."],
  ["Service detail", "0 direct", "Resolved from the same cached public snapshot."],
  ["Customer dashboard", "Up to 8", "One wallet document, five recent orders and two aggregation queries."],
  ["Customer order history", "Up to 20", "Cursor pagination; no second query after refresh."],
  ["Admin overview", "Bounded", "Compact totals, daily rollups and three provider state documents."],
  ["Finance dashboard", "Up to 27", "Compact rollups plus no more than 25 recent matching orders."],
  ["Unchanged provider sync", "About 2 reads / 4 writes", "Catalogue hash short-circuits before inventory reads."],
] as const;

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function OperationsPage() {
  await requireAdmin();
  const db = adminDb(), providers = providerDefinitions();
  const documents = await db.getAll(
    ...providers.flatMap((provider) => [
      db.collection("providerSyncState").doc(provider.key),
      db.collection("operationsAlerts").doc(`provider_sync_${provider.key}`),
      db.collection("operationsAlerts").doc(`publicCatalogFallback_${provider.key}`),
    ]),
  );
  const states = providers.map((provider, index) => {
    const state = documents[index * 3], syncAlert = documents[index * 3 + 1], fallbackAlert = documents[index * 3 + 2];
    const metrics = (state.data()?.lastMetrics || {}) as Record<string, unknown>;
    return {
      provider,
      status: String(state.get("status") || (provider.configured ? "Not synchronized" : "Not configured")),
      serviceCount: number(state.get("serviceCount")),
      reads: number(metrics.firestoreReads),
      writes: number(metrics.firestoreWrites),
      shortCircuited: metrics.shortCircuited === true,
      alert: syncAlert.get("active") === true,
      fallback: fallbackAlert.get("active") === true,
    };
  });
  const activeAlerts = states.filter((item) => item.alert || item.fallback).length;

  return <AppShell admin>
    <span className="eyebrow">Firebase cost control</span>
    <h1 className="page-heading">Operational read report</h1>
    <p className="muted page-lead">Bounded database work and the most recent catalogue synchronization measurements.</p>
    <div className="notice"><strong>{activeAlerts ? `${activeAlerts} operational alert${activeAlerts === 1 ? "" : "s"} require review` : "All Firebase guardrails are healthy"}</strong><p className="muted" style={{ marginBottom: 0 }}>The public catalogue never falls back to an unbounded collection scan. Customer lists, orders and finance reporting use bounded queries or rollups.</p></div>
    <div className="grid3" style={{ marginTop: 22 }}>{states.map((item) => <article className="glass card stat-card" key={item.provider.key}><span className="eyebrow">{item.provider.label}</span><strong className="stat-value" style={{ fontSize: 26 }}>{item.status.replaceAll("_", " ")}</strong><span className="muted">{item.serviceCount.toLocaleString("en-NG")} services · last sync {item.reads.toLocaleString("en-NG")} reads / {item.writes.toLocaleString("en-NG")} writes{item.shortCircuited ? " · unchanged shortcut" : ""}</span>{item.alert || item.fallback ? <span style={{ color: "#fbbf24" }}>Review required</span> : null}</article>)}</div>
    <section className="glass data-table-wrap" style={{ marginTop: 22 }}><table className="data-table"><thead><tr><th>Workflow</th><th>Approximate reads</th><th>Protection</th></tr></thead><tbody>{workflows.map(([workflow, reads, protection]) => <tr key={workflow}><td><strong>{workflow}</strong></td><td>{reads}</td><td>{protection}</td></tr>)}</tbody></table></section>
    <section className="glass card" style={{ marginTop: 22 }}><h2>Automatic thresholds</h2><ul className="muted" style={{ lineHeight: 1.9 }}><li>Provider syncs create a fixed-key warning at 10,000 reads or writes and a critical alert at 20,000.</li><li>Manual synchronization has a five-minute cooldown and a ten-minute distributed lock.</li><li>Customer-facing list queries return 50 or fewer records; order and notification pages return 20.</li><li>No pageview is written to Firestore.</li></ul></section>
  </AppShell>;
}
