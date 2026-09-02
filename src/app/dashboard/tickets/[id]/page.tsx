import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Toast } from "@/components/toast";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { replyToSupportTicket, setCustomerTicketStatus } from "../../support/actions";

export const dynamic = "force-dynamic";

type Attachment = { id?: string; name?: string; contentType?: string; size?: number };

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { notice } = await searchParams;
  const db = adminDb();
  const ticket = await db.collection("supportTickets").doc(id).get();
  if (!ticket.exists || ticket.get("userId") !== user.uid || ticket.get("source") === "inbound_email") notFound();
  const messageSnapshot = await db.collection("supportMessages").where("ticketId", "==", id).limit(200).get();
  const messages = messageSnapshot.docs.sort((a, b) => (a.get("createdAt")?.toMillis?.() || 0) - (b.get("createdAt")?.toMillis?.() || 0));
  const closed = ticket.get("status") === "closed";
  const orderId = String(ticket.get("orderId") || "");
  return <AppShell>
    {notice === "created" ? <Toast kind="success" title="Conversation started" message="Your support request and files were received securely." /> : null}
    {notice === "replied" ? <Toast kind="success" title="Reply sent" message="Your reply was added to this conversation." /> : null}
    {notice === "closed" ? <Toast kind="success" title="Conversation closed" message="You can reopen it if you need more help." /> : null}
    {notice === "open" ? <Toast kind="success" title="Conversation reopened" message="You can continue the conversation below." /> : null}
    <Link className="muted" href="/dashboard/support">← Back to support inbox</Link>
    <div className="support-thread-header glass card">
      <div><span className="eyebrow">Ticket #{id.slice(0, 8)}</span><h1 style={{ margin: "8px 0" }}>{String(ticket.get("subject") || "Support request")}</h1><p className="muted" style={{ margin: 0 }}>{orderId ? `Connected to order #${orderId.slice(0, 8)}` : "Account support conversation"}</p></div>
      <div className="support-thread-actions"><span className="status-pill">{closed ? "Closed" : ticket.get("lastSender") === "admin" ? "Your reply needed" : "With support"}</span><form action={setCustomerTicketStatus}><input type="hidden" name="ticketId" value={id} /><input type="hidden" name="status" value={closed ? "open" : "closed"} /><button className="btn" type="submit">{closed ? "Reopen conversation" : "Close conversation"}</button></form>{orderId ? <Link className="btn" href={`/dashboard/orders/${orderId}`}>View order</Link> : null}</div>
    </div>
    <section className="support-thread" aria-label="Support conversation">{messages.map((message) => {
      const admin = message.get("sender") === "admin";
      const attachments = (Array.isArray(message.get("attachments")) ? message.get("attachments") : []) as Attachment[];
      const sentAt = message.get("createdAt")?.toDate?.();
      return <article className={`support-message ${admin ? "support-message-admin" : "support-message-customer"}`} key={message.id}>
        <div className="support-message-author"><strong>{admin ? "Social Booster Support" : "You"}</strong><time className="muted">{sentAt ? sentAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "Sending…"}</time></div>
        <p>{String(message.get("message") || "")}</p>
        {attachments.length ? <div className="support-attachments">{attachments.map((attachment) => <a className="support-attachment" key={attachment.id} href={`/api/support/attachments/${message.id}/${attachment.id}`}>📎 {attachment.name || "Attachment"}<small>{attachment.size ? ` · ${Math.ceil(attachment.size / 1024)} KB` : ""}</small></a>)}</div> : null}
      </article>;
    })}</section>
    <section className="glass card support-reply-box">
      {closed ? <><h2>This conversation is closed</h2><p className="muted">Reopen it to send another message or attach additional evidence.</p></> : <><h2>Reply to support</h2><form action={replyToSupportTicket} encType="multipart/form-data" style={{ display: "grid", gap: 14 }}><input type="hidden" name="ticketId" value={id} /><label>Message<textarea className="field" name="message" minLength={2} maxLength={5000} rows={5} required placeholder="Write your reply…" /></label><label>Supporting files <span className="muted">(optional)</span><input className="field" type="file" name="attachments" accept=".jpg,.jpeg,.png,.webp,.pdf,.txt" multiple /><small className="muted">Up to 3 approved files; 3 MB total.</small></label><button className="btn primary" type="submit">Send reply</button></form></>}
    </section>
  </AppShell>;
}
