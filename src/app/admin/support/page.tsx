import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  await requireAdmin();
  const snapshot = await adminDb().collection("supportTickets").limit(100).get();
  const tickets = snapshot.docs.sort((a, b) => (b.get("createdAt")?.toMillis?.() || 0) - (a.get("createdAt")?.toMillis?.() || 0));
  return <AppShell admin><span className="eyebrow">Customer care</span><h1 className="page-heading">Support tickets</h1><p className="muted page-lead">Review payment and delivery reports. Confirm provider evidence before changing an order or wallet.</p><div className="glass data-table-wrap"><table className="data-table"><thead><tr><th>Ticket</th><th>Subject</th><th>Order</th><th>Priority</th><th>Status</th></tr></thead><tbody>{tickets.map((item) => <tr key={item.id}><td>#{item.id.slice(0, 8)}</td><td>{item.get("subject")}</td><td>{item.get("orderId") ? String(item.get("orderId")).slice(0, 8) : "—"}</td><td>{String(item.get("priority") || "normal")}</td><td><span className="status-pill">{String(item.get("status") || "open")}</span></td></tr>)}</tbody></table>{tickets.length === 0 ? <div className="card"><p className="muted">No support tickets have been submitted.</p></div> : null}</div></AppShell>;
}
