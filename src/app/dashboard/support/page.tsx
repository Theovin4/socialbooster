import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Toast } from "@/components/toast";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { createSupportTicket } from "./actions";

export const dynamic = "force-dynamic";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ order?: string; notice?: string; ticket?: string }> }) {
  const user = await requireUser();
  const { order = "", notice, ticket } = await searchParams;
  const snapshot = await adminDb().collection("supportTickets").where("userId", "==", user.uid).limit(50).get();
  const tickets = snapshot.docs.sort((a, b) => (b.get("createdAt")?.toMillis?.() || 0) - (a.get("createdAt")?.toMillis?.() || 0));
  const whatsapp = (process.env.NEXT_PUBLIC_WHATSAPP || "").replace(/\D/g, "");
  return <AppShell>{notice === "created" ? <Toast kind="success" title="Support request received" message={`Ticket #${String(ticket || "").slice(0, 8)} was created. Keep this reference for follow-up.`} /> : null}<span className="eyebrow">Customer care</span><h1 className="page-heading">Support</h1><p className="muted page-lead">Report a payment or delivery problem with the relevant reference. Never send your password, PIN, CVV or OTP.</p><div className="form-grid"><section className="glass card"><h2>Create a support ticket</h2><form action={createSupportTicket} style={{ display: "grid", gap: 16 }}><label>Order ID (optional)<input className="field" name="orderId" defaultValue={order} /></label><label>Subject<input className="field" name="subject" required minLength={5} maxLength={120} defaultValue={order ? "Order marked completed but not delivered" : ""} /></label><label>What happened?<textarea className="field" name="message" required minLength={15} maxLength={2000} rows={6} defaultValue={order ? "The order is marked completed, but I cannot confirm that the service was delivered. Please verify the supplier evidence and assist me." : ""} /></label><button className="btn primary" type="submit">Submit support request</button></form>{whatsapp ? <p style={{ marginTop: 18 }}><a className="btn" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">Message support on WhatsApp</a></p> : null}</section><section className="glass card"><h2>Your tickets</h2>{tickets.length ? tickets.map((item) => <div key={item.id} style={{ padding: "14px 0", borderBottom: "1px solid var(--line)" }}><div className="section-head"><strong>#{item.id.slice(0, 8)}</strong><span className="status-pill">{String(item.get("status") || "open")}</span></div><p>{item.get("subject")}</p>{item.get("orderId") ? <Link className="muted" href={`/dashboard/orders/${item.get("orderId")}`}>View related order</Link> : null}</div>) : <p className="muted">You have no support tickets yet.</p>}</section></div></AppShell>;
}
