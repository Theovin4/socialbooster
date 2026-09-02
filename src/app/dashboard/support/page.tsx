import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { createSupportTicket } from "./actions";

export const dynamic = "force-dynamic";

function ticketLabel(status: string, lastSender: string) {
  if (status === "closed") return "Closed";
  if (lastSender === "admin" || status === "replied") return "Your reply needed";
  return "With support";
}

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ order?: string; view?: string }> }) {
  const user = await requireUser();
  const { order = "", view = "open" } = await searchParams;
  const snapshot = await adminDb().collection("supportTickets").where("userId", "==", user.uid).limit(100).get();
  const allTickets = snapshot.docs.sort((a, b) => (b.get("updatedAt")?.toMillis?.() || b.get("createdAt")?.toMillis?.() || 0) - (a.get("updatedAt")?.toMillis?.() || a.get("createdAt")?.toMillis?.() || 0));
  const openCount = allTickets.filter((item) => item.get("status") !== "closed").length;
  const closedCount = allTickets.length - openCount;
  const tickets = allTickets.filter((item) => view === "closed" ? item.get("status") === "closed" : view === "all" ? true : item.get("status") !== "closed");
  const whatsapp = (process.env.NEXT_PUBLIC_WHATSAPP || "").replace(/\D/g, "");
  return <AppShell>
    <span className="eyebrow">Customer care</span>
    <h1 className="page-heading">Support centre</h1>
    <p className="muted page-lead">Keep each issue in one private conversation. Support aims to respond within 24 hours.</p>
    <div className="grid3" style={{ margin: "28px 0" }}>
      <div className="glass card"><p className="muted">Open conversations</p><strong style={{ fontSize: 34 }}>{openCount}</strong></div>
      <div className="glass card"><p className="muted">Closed conversations</p><strong style={{ fontSize: 34 }}>{closedCount}</strong></div>
      <div className="glass card"><p className="muted">Response target</p><strong style={{ fontSize: 24 }}>Within 24 hours</strong></div>
    </div>
    <div className="support-layout">
      <section className="glass card support-compose">
        <span className="eyebrow">New conversation</span><h2>How can we help?</h2>
        <form action={createSupportTicket} encType="multipart/form-data" style={{ display: "grid", gap: 16 }}>
          <label>Order ID <span className="muted">(optional)</span><input className="field" name="orderId" defaultValue={order} /></label>
          <label>Subject<input className="field" name="subject" required minLength={5} maxLength={120} defaultValue={order ? "Order delivery issue" : ""} placeholder="Summarise the issue" /></label>
          <label>Message<textarea className="field" name="message" required minLength={15} maxLength={3000} rows={6} defaultValue={order ? "Please review this order. The delivery shown in my account does not match what I received." : ""} placeholder="Include the relevant details and what you need help with." /></label>
          <label>Supporting files <span className="muted">(optional)</span><input className="field" type="file" name="attachments" accept=".jpg,.jpeg,.png,.webp,.pdf,.txt" multiple /><small className="muted">Up to 3 JPG, PNG, WebP, PDF or TXT files; 700 KB each and 2 MB total. Never upload passwords, PINs, CVVs or OTPs.</small></label>
          <button className="btn primary" type="submit">Start support conversation</button>
        </form>
        {whatsapp ? <p style={{ marginTop: 18 }}><a className="btn" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">Contact support on WhatsApp</a></p> : null}
      </section>
      <section>
        <div className="section-head support-inbox-head"><div><span className="eyebrow">Private inbox</span><h2>Your conversations</h2></div><div className="support-filters"><Link className={`btn${view === "open" ? " primary" : ""}`} href="/dashboard/support?view=open">Open</Link><Link className={`btn${view === "closed" ? " primary" : ""}`} href="/dashboard/support?view=closed">Closed</Link><Link className={`btn${view === "all" ? " primary" : ""}`} href="/dashboard/support?view=all">All</Link></div></div>
        <div className="support-ticket-list">{tickets.map((item) => {
          const status = String(item.get("status") || "open"), lastSender = String(item.get("lastSender") || "customer");
          const updated = item.get("updatedAt")?.toDate?.() || item.get("createdAt")?.toDate?.();
          return <Link className="glass support-ticket-row" href={`/dashboard/tickets/${item.id}`} key={item.id}>
            <div><div className="support-ticket-meta"><span>#{item.id.slice(0, 8)}</span>{item.get("priority") === "high" ? <span className="support-priority">Priority</span> : null}</div><h3>{String(item.get("subject") || "Support request")}</h3><p className="muted support-preview">{String(item.get("lastMessage") || item.get("lastReply") || item.get("message") || "Open conversation")}</p></div>
            <div className="support-ticket-state"><span className="status-pill">{ticketLabel(status, lastSender)}</span><small className="muted">{updated ? updated.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "Recently"}</small></div>
          </Link>;
        })}{tickets.length === 0 ? <div className="glass card"><h3>No {view === "all" ? "support" : view} conversations</h3><p className="muted">New and existing support conversations will be organised here.</p></div> : null}</div>
      </section>
    </div>
  </AppShell>;
}
