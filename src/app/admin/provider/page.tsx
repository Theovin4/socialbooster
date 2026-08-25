import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";
import { FollowsPanelClient } from "@/lib/providers/followspanel";
import { formatMoney } from "@/lib/money";
import { refreshLiveOrders, refundOrder } from "./actions";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

export default async function ProviderHealthPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdmin();
  const input = await searchParams, page = Math.max(1, Number.parseInt(input.page || "1", 10) || 1), db = adminDb();
  const [orderSnapshot, countSnapshot] = await Promise.all([
    db.collection("orders").orderBy("createdAt", "desc").offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE + 1).get(),
    db.collection("orders").count().get(),
  ]);
  const hasNext = orderSnapshot.size > PAGE_SIZE, orders = orderSnapshot.docs.slice(0, PAGE_SIZE), total = countSnapshot.data().count;
  const providerIds = orders.map((item) => item.get("providerOrderId")).filter((value): value is number => Number.isInteger(value));
  const client = new FollowsPanelClient(), chunks = Array.from({ length: Math.ceil(providerIds.length / 100) }, (_, index) => providerIds.slice(index * 100, index * 100 + 100));
  const [balanceResult, servicesResult, statusResults] = await Promise.all([
    client.balance().then((value) => ({ ok: true as const, value })).catch(() => ({ ok: false as const })),
    client.services().then((value) => ({ ok: true as const, value })).catch(() => ({ ok: false as const })),
    Promise.all(chunks.map((ids) => client.statuses(ids).catch(() => ({})))),
  ]);
  const statuses = Object.assign({}, ...statusResults) as Record<string, { status: string; start_count?: string; remains?: string }>;
  const connected = balanceResult.ok && servicesResult.ok;
  let endpoint = "Not configured"; try { endpoint = new URL(process.env.FOLLOWSPANEL_API_URL || "").host; } catch {}
  return <AppShell admin>
    <div className="section-head"><div><span className="eyebrow">Live order operations</span><h1 className="page-heading">Orders & API health</h1><p className="muted page-lead">View current Followpanel status, original start count and remaining quantity for every submitted order.</p></div><form action={refreshLiveOrders}><button className="btn primary">Refresh live data</button></form></div>
    <div className="grid3"><article className="glass card stat-card"><span className="muted">Connection</span><strong className="stat-value">{connected ? "Connected" : "Action required"}</strong></article><article className="glass card stat-card"><span className="muted">API account balance</span><strong className="stat-value">{balanceResult.ok ? `${balanceResult.value.currency} ${balanceResult.value.balance}` : "Unavailable"}</strong></article><article className="glass card stat-card"><span className="muted">Customer orders</span><strong className="stat-value">{total.toLocaleString("en-NG")}</strong></article></div>
    <div className={`notice${connected ? "" : " danger"}`} style={{ margin: "22px 0" }}><strong>{connected ? `Connected to ${endpoint}` : "Followpanel API connection failed"}</strong><p className="muted" style={{ marginBottom: 0 }}>{connected ? `${servicesResult.ok ? servicesResult.value.length.toLocaleString("en-NG") : 0} services available. Live results were requested when this page loaded.` : "Confirm the Followpanel URL and API key in Vercel."}</p></div>
    <section className="glass data-table-wrap"><table className="data-table"><thead><tr><th>Order</th><th>Date</th><th>Followpanel ID</th><th>Service</th><th>Qty</th><th>Charge</th><th>Local status</th><th>Live status</th><th>Start</th><th>Remaining</th><th>Last update</th><th></th></tr></thead><tbody>{orders.map((item) => {
      const providerId = item.get("providerOrderId"), live = providerId ? statuses[String(providerId)] : undefined, refunded = item.get("status") === "refunded", createdAt = item.get("createdAt")?.toDate?.(), lastUpdate = item.get("lastProviderUpdate")?.toDate?.();
      return <tr key={item.id}><td>#{item.id.slice(0, 8)}</td><td>{createdAt ? createdAt.toLocaleString("en-NG") : "—"}</td><td>{providerId || "Not submitted"}</td><td>{item.get("serviceName")}</td><td>{Number(item.get("quantity") || 0).toLocaleString("en-NG")}</td><td>{formatMoney(BigInt(item.get("customerPriceMinor") || 0), item.get("currency") || "NGN")}</td><td><span className="status-pill">{String(item.get("status") || "unknown").replaceAll("_", " ")}</span></td><td>{live?.status || item.get("providerStatus") || (providerId ? "Unavailable" : "—")}</td><td>{live?.start_count ?? item.get("startCount") ?? "—"}</td><td>{live?.remains ?? item.get("remains") ?? "—"}</td><td>{lastUpdate ? lastUpdate.toLocaleString("en-NG") : "—"}</td><td>{refunded ? <span className="status-pill">Refunded</span> : <form action={refundOrder}><input type="hidden" name="orderId" value={item.id} /><button className="btn" type="submit">Refund</button></form>}</td></tr>;
    })}</tbody></table>{orders.length === 0 ? <div className="card"><p className="muted">No customer orders have been created yet.</p></div> : null}</section>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 18 }}><span className="muted">Page {page} · showing {orders.length} of {total.toLocaleString("en-NG")}</span><div style={{ display: "flex", gap: 10 }}>{page > 1 ? <Link className="btn" href={`/admin/provider?page=${page - 1}`}>Previous</Link> : null}{hasNext ? <Link className="btn" href={`/admin/provider?page=${page + 1}`}>Next</Link> : null}</div></div>
  </AppShell>;
}
