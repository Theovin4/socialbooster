import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Toast } from "@/components/toast";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";
import { replyToDashboardTicket, replyToInboundEmail, setAdminTicketStatus } from "../actions";

export const dynamic = "force-dynamic";
type Attachment = { id?: string; name?: string; filename?: string; size?: number };

export default async function AdminTicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { notice } = await searchParams;
  const db = adminDb();
  const ticket = await db.collection("supportTickets").doc(id).get();
  if (!ticket.exists) notFound();
  const inbound = ticket.get("source") === "inbound_email";
  const messageSnapshot = inbound ? null : await db.collection("supportMessages").where("ticketId", "==", id).limit(200).get();
  const messages = messageSnapshot?.docs.sort((a, b) => (a.get("createdAt")?.toMillis?.() || 0) - (b.get("createdAt")?.toMillis?.() || 0)) || [];
  const closed = ticket.get("status") === "closed";
  const orderId = String(ticket.get("orderId") || "");
  const inboundAttachments = (Array.isArray(ticket.get("attachments")) ? ticket.get("attachments") : []) as Attachment[];
  return <AppShell admin>
    {notice === "replied" ? <Toast kind="success" title="Reply sent" message="The response was delivered and recorded in the conversation." /> : null}
    {notice === "closed" ? <Toast kind="success" title="Conversation closed" message="It remains available in the closed inbox." /> : null}
    {notice === "open" ? <Toast kind="success" title="Conversation reopened" message="Replies are enabled again." /> : null}
    <Link className="muted" href="/admin/support">← Back to support inbox</Link>
    <div className="support-thread-header glass card">
      <div><span className="eyebrow">{inbound ? "Inbound email" : `Ticket #${id.slice(0, 8)}`}</span><h1 style={{ margin: "8px 0" }}>{String(ticket.get("subject") || "Support request")}</h1><p className="muted" style={{ margin: 0 }}>{inbound ? `From ${String(ticket.get("fromEmail") || "customer")}` : orderId ? `Connected to order #${orderId.slice(0, 8)}` : `Customer ${String(ticket.get("userId") || "")}`}</p></div>
      <div className="support-thread-actions"><span className="status-pill">{closed ? "Closed" : ticket.get("lastSender") === "admin" || ticket.get("status") === "replied" ? "Waiting for customer" : "Needs response"}</span><form action={setAdminTicketStatus}><input type="hidden" name="ticketId" value={id} /><input type="hidden" name="status" value={closed ? "open" : "closed"} /><button className="btn" type="submit">{closed ? "Reopen conversation" : "Close conversation"}</button></form>{orderId ? <Link className="btn" href="/admin/provider">Verify live delivery</Link> : null}</div>
    </div>
    <section className="support-thread" aria-label="Support conversation">
      {inbound ? <article className="support-message support-message-customer"><div className="support-message-author"><strong>{String(ticket.get("fromEmail") || "Customer")}</strong><time className="muted">Inbound email</time></div><p>{String(ticket.get("message") || "")}</p>{inboundAttachments.length ? <div className="support-attachments">{inboundAttachments.map((attachment, index) => <span className="support-attachment" key={`${attachment.filename}-${index}`}>📎 {attachment.filename || attachment.name || "Attachment"}</span>)}</div> : null}</article> : messages.map((message) => {
        const adminMessage = message.get("sender") === "admin";
        const attachments = (Array.isArray(message.get("attachments")) ? message.get("attachments") : []) as Attachment[];
        const sentAt = message.get("createdAt")?.toDate?.();
        return <article className={`support-message ${adminMessage ? "support-message-admin" : "support-message-customer"}`} key={message.id}><div className="support-message-author"><strong>{adminMessage ? "You · Social Booster Support" : "Customer"}</strong><time className="muted">{sentAt ? sentAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "Sending…"}</time></div><p>{String(message.get("message") || "")}</p>{attachments.length ? <div className="support-attachments">{attachments.map((attachment) => <a className="support-attachment" key={attachment.id} href={`/api/support/attachments/${message.id}/${attachment.id}`}>📎 {attachment.name || "Attachment"}<small>{attachment.size ? ` · ${Math.ceil(attachment.size / 1024)} KB` : ""}</small></a>)}</div> : null}</article>;
      })}
      {inbound && ticket.get("lastReply") ? <article className="support-message support-message-admin"><div className="support-message-author"><strong>You · Social Booster Support</strong><time className="muted">Latest reply</time></div><p>{String(ticket.get("lastReply"))}</p></article> : null}
    </section>
    <section className="glass card support-reply-box">{closed ? <><h2>This conversation is closed</h2><p className="muted">Reopen it before sending another response.</p></> : <><h2>Reply to customer</h2><form action={inbound ? replyToInboundEmail : replyToDashboardTicket} encType="multipart/form-data" style={{ display: "grid", gap: 14 }}><input type="hidden" name="ticketId" value={id} /><label>Message<textarea className="field" name="message" minLength={2} maxLength={5000} rows={6} required placeholder="Write a clear, helpful response…" /></label>{!inbound ? <label>Supporting files <span className="muted">(optional)</span><input className="field" type="file" name="attachments" accept=".jpg,.jpeg,.png,.webp,.pdf,.txt" multiple /><small className="muted">Up to 3 approved files; 700 KB each and 2 MB total.</small></label> : null}<button className="btn primary" type="submit">Send reply</button></form></>}</section>
  </AppShell>;
}
