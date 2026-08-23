import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
const filters = ["all", "pending", "in_progress", "processing", "completed", "partial", "cancelled", "failed"];

function date(value: { toDate?: () => Date } | undefined) { return value?.toDate?.().toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }) || "Processing"; }

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const user = await requireUser(), { status = "all", q = "" } = await searchParams;
  const snapshot = await adminDb().collection("orders").where("userId", "==", user.uid).limit(250).get();
  const needle = q.trim().toLowerCase();
  const orders = snapshot.docs.sort((a, b) => (b.get("createdAt")?.toMillis?.() || 0) - (a.get("createdAt")?.toMillis?.() || 0)).filter((doc) => { const item = doc.data(), current = String(item.status || "pending").toLowerCase(); return (status === "all" || current === status) && (!needle || `${doc.id} ${item.serviceName} ${item.link}`.toLowerCase().includes(needle)); }).slice(0, 100);

  return <AppShell><span className="eyebrow">Order management</span><h1 className="page-heading">Your orders</h1><p className="muted page-lead">Search, filter and open any order to view provider progress, refill eligibility and cancellation controls.</p><div className="section-head"><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{filters.map((item) => <Link className={`btn${status === item ? " primary" : ""}`} key={item} href={`/dashboard/orders?status=${item}`}>{item.replaceAll("_", " ")}</Link>)}</div><form style={{ display: "flex", gap: 8 }}><input type="hidden" name="status" value={status} /><input className="field" name="q" defaultValue={q} placeholder="Search orders" aria-label="Search orders" /><button className="btn">Search</button></form></div>{orders.length === 0 ? <div className="glass card"><h2>No matching orders</h2><p className="muted">Place your first order or choose another filter.</p><Link className="btn primary" href="/dashboard/new-order">Create order</Link></div> : <div className="glass data-table-wrap"><table className="data-table"><thead><tr><th>Order</th><th>Date</th><th>Service</th><th>Quantity</th><th>Charge</th><th>Status</th><th></th></tr></thead><tbody>{orders.map((doc) => { const item = doc.data(); return <tr key={doc.id}><td>#{doc.id.slice(0, 8)}</td><td>{date(item.createdAt)}</td><td style={{ maxWidth: 380 }}>{item.serviceName}</td><td>{Number(item.quantity || 0).toLocaleString("en-NG")}</td><td>{formatMoney(BigInt(item.customerPriceMinor || 0), String(item.currency || "NGN"))}</td><td><span className="status-pill">{String(item.status || "pending").replaceAll("_", " ")}</span></td><td><Link className="btn" href={`/dashboard/orders/${doc.id}`}>View</Link></td></tr>; })}</tbody></table></div>}</AppShell>;
}
