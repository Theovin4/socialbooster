import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";

export const dynamic = "force-dynamic";

type Comparison = {
  displayed: number | null;
  authoritative: number | null;
  difference: number | null;
  match: boolean;
};

function comparisons(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, Comparison>);
}

export default async function DataQualityPage() {
  await requireAdmin();
  const snapshot = await adminDb().collection("analyticsDataQuality").doc("global").get();
  const finance = comparisons(snapshot.get("finance"));
  const crossPage = comparisons(snapshot.get("crossPage"));
  const rows = [...finance, ...crossPage];
  const reconciledAt = snapshot.get("lastReconciledAt")?.toDate?.() || null;
  const status = snapshot.exists ? String(snapshot.get("status") || "UNAVAILABLE") : "UNAVAILABLE";
  return <AppShell admin>
    <span className="eyebrow">Analytics truthfulness</span>
    <h1 className="page-heading">Data quality</h1>
    <p className="muted page-lead">The latest stored reconciliation result. Opening this page does not scan operational collections.</p>
    <div className="notice"><strong>{status}</strong><p className="muted" style={{ marginBottom: 0 }}>Quality state: {snapshot.exists ? String(snapshot.get("qualityState") || "UNAVAILABLE") : "UNAVAILABLE"} · Last reconciled {reconciledAt?.toLocaleString("en-NG", { timeZone: "Africa/Lagos" }) || "not yet"}. Run a fresh reconciliation from Finance when needed.</p></div>
    <section className="glass data-table-wrap" style={{ marginTop: 22 }}>
      <table className="data-table"><thead><tr><th>Metric</th><th>Displayed</th><th>Authoritative</th><th>Difference</th><th>Quality</th></tr></thead><tbody>{rows.map(([metric, item]) => <tr key={metric}><td>{metric.replaceAll(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase())}</td><td>{item.displayed === null ? "Unavailable" : item.displayed.toLocaleString("en-NG")}</td><td>{item.authoritative === null ? "Unavailable" : item.authoritative.toLocaleString("en-NG")}</td><td>{item.difference === null ? "Unavailable" : item.difference.toLocaleString("en-NG")}</td><td>{item.match ? "MATCH" : "DRIFT"}</td></tr>)}</tbody></table>
      {!rows.length ? <div className="card"><p className="muted">No reconciliation has been recorded yet.</p></div> : null}
    </section>
    <div style={{ marginTop: 18 }}><Link className="btn primary" href="/admin/finance">Open Finance controls</Link></div>
  </AppShell>;
}
