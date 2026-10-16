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
  ["Admin overview", "About 7 default; < 30", "Compact totals, monthly growth buckets and one actionable-order aggregate."],
  ["Finance dashboard", "About 27 default; < 50", "One global rollup, compact monthly buckets and no more than 25 recent matching orders."],
  ["Support inbox", "Up to 28", "Latest 25 conversations plus three exact aggregate counts."],
  ["Crypto administration", "Up to 28", "Latest 25 records plus three exact aggregate counts; expiry is handled by cron."],
  ["Email marketing", "Up to 27 per cache refresh", "Twelve exact aggregates plus the latest 15 campaigns; cached for five minutes."],
  ["Acquisition report", "Up to 126 documents + 4 aggregates per cache refresh", "Top 50 first-touch and last-touch rollups, up to 25 pending reviews and one settings document; cached for five minutes. No pageview documents."],
  ["Customer referrals", "Up to 52", "A two-document idempotent code check plus at most 50 referred registrations; no unbounded scan."],
  ["Unchanged provider sync", "About 2 reads / 4 writes", "Catalogue hash short-circuits before inventory reads."],
] as const;

function number(value: unknown) {
  const parsed = Number(value);
  return value !== undefined && value !== null && Number.isFinite(parsed) ? parsed : null;
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
    <div className="grid3" style={{ marginTop: 22 }}>{states.map((item) => <article className="glass card stat-card" key={item.provider.key}><span className="eyebrow">{item.provider.label}</span><strong className="stat-value" style={{ fontSize: 26 }}>{item.status.replaceAll("_", " ")}</strong><span className="muted">{item.serviceCount === null ? "Service count unavailable" : `${item.serviceCount.toLocaleString("en-NG")} services`} · last measured sync {item.reads === null ? "reads unavailable" : `${item.reads.toLocaleString("en-NG")} reads`} / {item.writes === null ? "writes unavailable" : `${item.writes.toLocaleString("en-NG")} writes`}{item.shortCircuited ? " · unchanged shortcut" : ""}</span>{item.alert || item.fallback ? <span style={{ color: "#fbbf24" }}>Review required</span> : null}</article>)}</div>
    <section className="glass data-table-wrap" style={{ marginTop: 22 }}><table className="data-table"><thead><tr><th>Workflow</th><th>Expected read budget</th><th>Protection</th></tr></thead><tbody>{workflows.map(([workflow, reads, protection]) => <tr key={workflow}><td><strong>{workflow}</strong></td><td>{reads}</td><td>{protection}</td></tr>)}</tbody></table><p className="muted" style={{ padding: "0 18px 18px" }}>Expected budgets are architecture estimates, not live Firebase billing measurements. Provider cards above show measured values from the latest recorded synchronization when available.</p></section>
    <section className="glass card" style={{ marginTop: 22 }}><h2>Automatic thresholds</h2><ul className="muted" style={{ lineHeight: 1.9 }}><li>Provider syncs create a fixed-key warning at 10,000 reads or writes and a critical alert at 20,000.</li><li>Manual synchronization has a five-minute cooldown and a ten-minute distributed lock.</li><li>Customer-facing list queries return 50 or fewer records; order and notification pages return 20.</li><li>No pageview is written to Firestore.</li></ul></section>
  </AppShell>;
}
