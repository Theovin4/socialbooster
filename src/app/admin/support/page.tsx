import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";
import { replyToInboundEmail } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  await requireAdmin();
  const snapshot = await adminDb().collection("supportTickets").limit(100).get();
  const tickets = snapshot.docs.sort((a, b) => (b.get("createdAt")?.toMillis?.() || 0) - (a.get("createdAt")?.toMillis?.() || 0));
  return <AppShell admin><span className="eyebrow">Customer care</span><h1 className="page-heading">Support inbox</h1><p className="muted page-lead">Dashboard tickets and verified inbound messages sent to support@socialbooster.net.ng appear here. Target response time: within 24 hours.</p><div style={{ display: "grid", gap: 16 }}>{tickets.map((item) => { const inbound = item.get("source") === "inbound_email"; return <article className="glass card" key={item.id}><div className="section-head"><div><span className="eyebrow">{inbound ? "Inbound email" : "Dashboard ticket"}</span><h2 style={{ margin: "6px 0" }}>{item.get("subject")}</h2><p className="muted" style={{ margin: 0 }}>{inbound ? `From ${item.get("fromEmail")}` : item.get("orderId") ? `Order #${String(item.get("orderId")).slice(0, 8)}` : `Ticket #${item.id.slice(0, 8)}`}</p></div><span className="status-pill">{String(item.get("status") || "open")}</span></div><p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{String(item.get("message") || "No message supplied")}</p>{Array.isArray(item.get("attachments")) && item.get("attachments").length ? <p className="muted">Attachments: {item.get("attachments").map((attachment: { filename?: string }) => attachment.filename || "attachment").join(", ")}</p> : null}{inbound ? <form action={replyToInboundEmail} style={{ display: "grid", gap: 12, marginTop: 18 }}><input type="hidden" name="ticketId" value={item.id} /><label>Reply<textarea className="field" name="message" minLength={10} maxLength={5000} rows={5} required placeholder="Write a clear support response…" /></label><button className="btn primary" type="submit">Send branded reply</button></form> : null}</article>; })}{tickets.length === 0 ? <div className="glass card"><h2>No support messages</h2><p className="muted">New dashboard tickets and inbound emails will appear here.</p></div> : null}</div></AppShell>;
}
