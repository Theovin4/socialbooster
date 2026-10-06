import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/firebase/session";

export const dynamic = "force-dynamic";

const workflows = [
  ["Public homepage", "0", "Static content; no Firestore request."],
  ["Services first page", "0 warm / up to 400 per cold chunk", "Shared server cache lasts 24 hours. Only 50 services are returned to the browser."],
  ["Service search", "0 warm", "Submitted search runs against the shared server cache; there is no request on each keystroke."],
  ["Customer dashboard", "Up to 8", "One wallet document, five recent orders and two aggregation queries."],
  ["Customer order history", "Up to 25", "One bounded query for the most recent 25 orders."],
  ["Admin dashboard", "About 5", "One totals document and four aggregation queries. No customer collection scan."],
  ["Finance dashboard", "Up to 401", "Two bounded 200-record queries plus one wallet aggregation."],
  ["Provider synchronization", "Inventory-sized", "Protected scheduled/admin job. Reads existing records once, then writes only changed records."],
] as const;

export default async function OperationsPage() {
  await requireAdmin();
  return <AppShell admin><span className="eyebrow">Firebase cost control</span><h1 className="page-heading">Operational read report</h1><p className="muted page-lead">Approximate server-side database work for each major workflow. Counts are intentionally estimated without storing pageviews in Firestore.</p>
    <div className="notice"><strong>Guardrails active</strong><p className="muted" style={{ marginBottom: 0 }}>Customer and finance lists have explicit limits, the administration overview uses one totals document instead of scanning customers, and the public catalogue is shared through a 24-hour server cache.</p></div>
    <section className="glass data-table-wrap" style={{ marginTop: 22 }}><table className="data-table"><thead><tr><th>Workflow</th><th>Approximate reads</th><th>Protection</th></tr></thead><tbody>{workflows.map(([workflow, reads, protection]) => <tr key={workflow}><td><strong>{workflow}</strong></td><td>{reads}</td><td>{protection}</td></tr>)}</tbody></table></section>
    <section className="glass card" style={{ marginTop: 22 }}><h2>Alert thresholds</h2><ul className="muted" style={{ lineHeight: 1.9 }}><li>A catalogue synchronization processing more than 20,000 records is logged as an operational warning.</li><li>Customer-facing queries are bounded to 50 or fewer visible records.</li><li>Quota failures are logged for administrators while customers receive calm fallback messages.</li><li>No individual pageview is written to Firestore.</li></ul></section>
  </AppShell>;
}
