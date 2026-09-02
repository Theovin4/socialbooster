import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";

export const dynamic = "force-dynamic";

function adminState(status: string, lastSender: string, inbound: boolean) {
  if (status === "closed") return "Closed";
  if (inbound && status === "replied") return "Replied";
  if (lastSender === "admin" || status === "replied") return "Waiting for customer";
  return "Needs response";
}

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ view?: string; source?: string }> }) {
  await requireAdmin();
  const { view = "open", source = "all" } = await searchParams;
  const snapshot = await adminDb().collection("supportTickets").limit(200).get();
  const all = snapshot.docs.sort((a, b) => (b.get("updatedAt")?.toMillis?.() || b.get("createdAt")?.toMillis?.() || 0) - (a.get("updatedAt")?.toMillis?.() || a.get("createdAt")?.toMillis?.() || 0));
  const openCount = all.filter((item) => item.get("status") !== "closed").length;
  const needsResponse = all.filter((item) => item.get("status") !== "closed" && item.get("lastSender") !== "admin" && item.get("status") !== "replied").length;
  const closedCount = all.length - openCount;
  const tickets = all.filter((item) => {
    const statusMatch = view === "all" ? true : view === "closed" ? item.get("status") === "closed" : view === "needs-response" ? item.get("status") !== "closed" && item.get("lastSender") !== "admin" && item.get("status") !== "replied" : item.get("status") !== "closed";
    const sourceMatch = source === "all" ? true : source === "email" ? item.get("source") === "inbound_email" : item.get("source") !== "inbound_email";
    return statusMatch && sourceMatch;
  });
  return <AppShell admin>
    <span className="eyebrow">Customer care</span><h1 className="page-heading">Support inbox</h1>
    <p className="muted page-lead">Dashboard conversations and messages received at support@socialbooster.net.ng, organised in one private inbox.</p>
    <div className="grid3" style={{ margin: "28px 0" }}><div className="glass card"><p className="muted">Needs response</p><strong style={{ fontSize: 34 }}>{needsResponse}</strong></div><div className="glass card"><p className="muted">Open</p><strong style={{ fontSize: 34 }}>{openCount}</strong></div><div className="glass card"><p className="muted">Closed</p><strong style={{ fontSize: 34 }}>{closedCount}</strong></div></div>
    <div className="glass card support-admin-toolbar"><div className="support-filters"><Link className={`btn${view === "needs-response" ? " primary" : ""}`} href={`/admin/support?view=needs-response&source=${source}`}>Needs response</Link><Link className={`btn${view === "open" ? " primary" : ""}`} href={`/admin/support?view=open&source=${source}`}>Open</Link><Link className={`btn${view === "closed" ? " primary" : ""}`} href={`/admin/support?view=closed&source=${source}`}>Closed</Link><Link className={`btn${view === "all" ? " primary" : ""}`} href={`/admin/support?view=all&source=${source}`}>All</Link></div><div className="support-filters"><Link className={`btn${source === "all" ? " primary" : ""}`} href={`/admin/support?view=${view}&source=all`}>All sources</Link><Link className={`btn${source === "dashboard" ? " primary" : ""}`} href={`/admin/support?view=${view}&source=dashboard`}>Dashboard</Link><Link className={`btn${source === "email" ? " primary" : ""}`} href={`/admin/support?view=${view}&source=email`}>Email</Link></div></div>
    <div className="support-ticket-list" style={{ marginTop: 18 }}>{tickets.map((item) => {
      const inbound = item.get("source") === "inbound_email";
      const status = String(item.get("status") || "open"), lastSender = String(item.get("lastSender") || "customer");
      const updated = item.get("updatedAt")?.toDate?.() || item.get("createdAt")?.toDate?.();
      return <Link className="glass support-ticket-row" href={`/admin/support/${item.id}`} key={item.id}>
        <div><div className="support-ticket-meta"><span>{inbound ? "Inbound email" : `Ticket #${item.id.slice(0, 8)}`}</span>{item.get("priority") === "high" ? <span className="support-priority">Priority</span> : null}</div><h3>{String(item.get("subject") || "Support request")}</h3><p className="muted support-preview">{String(item.get("lastMessage") || item.get("lastReply") || item.get("message") || "Open conversation")}</p><small className="muted">{inbound ? String(item.get("fromEmail") || "Email customer") : item.get("orderId") ? `Order #${String(item.get("orderId")).slice(0, 8)}` : "Dashboard customer"}</small></div>
        <div className="support-ticket-state"><span className="status-pill">{adminState(status, lastSender, inbound)}</span><small className="muted">{updated ? updated.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "Recently"}</small></div>
      </Link>;
    })}{tickets.length === 0 ? <div className="glass card"><h2>Inbox is clear</h2><p className="muted">No conversations match the selected filters.</p></div> : null}</div>
  </AppShell>;
}
