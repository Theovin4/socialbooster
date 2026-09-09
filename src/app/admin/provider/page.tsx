import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";
import { normalizeProviderKey, providerDefinitions } from "@/lib/providers";
import { formatMoney } from "@/lib/money";
import { FieldPath } from "firebase-admin/firestore";
import { refreshLiveOrders, refundOrder, retryCancellation } from "./actions";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;
type LiveStatus = { status: string; start_count?: string; remains?: string };

export default async function ProviderHealthPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdmin();
  const input = await searchParams, page = Math.max(1, Number.parseInt(input.page || "1", 10) || 1), db = adminDb();
  const [orderSnapshot, countSnapshot] = await Promise.all([
    db.collection("orders").orderBy("createdAt", "desc").offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE + 1).get(),
    db.collection("orders").count().get(),
  ]);
  const hasNext = orderSnapshot.size > PAGE_SIZE, orders = orderSnapshot.docs.slice(0, PAGE_SIZE), total = countSnapshot.data().count;
  const providers = providerDefinitions();
  const health = await Promise.all(providers.map(async (provider) => {
    if (!provider.configured) return { ...provider, connected: false as const, balance: null, serviceCount: 0 };
    const catalogueQuery = provider.key === "followspanel"
      ? db.collection("providerServices").where(FieldPath.documentId(), ">=", "0").where(FieldPath.documentId(), "<=", `9\uf8ff`)
      : db.collection("providerServices").where("providerKey", "==", provider.key);
    const [balance, catalogueCount, syncState] = await Promise.all([
      provider.client.balance().catch(() => null),
      catalogueQuery.count().get().catch(() => null),
      db.collection("providerSyncState").doc(provider.key).get().catch(() => null),
    ]);
    const storedCount = Number(catalogueCount?.data().count || 0);
    return { ...provider, connected: Boolean(balance), balance, serviceCount: storedCount || Number(syncState?.get("serviceCount") || 0) };
  }));
  const statusGroups = new Map<string, number[]>();
  for (const order of orders) {
    const id = order.get("providerOrderId"); if (!Number.isInteger(id)) continue;
    const key = normalizeProviderKey(order.get("providerKey")); statusGroups.set(key, [...(statusGroups.get(key) || []), id]);
  }
  const liveByProvider = new Map<string, Record<string, LiveStatus>>();
  await Promise.all(Array.from(statusGroups.entries()).map(async ([key, ids]) => {
    const provider = providers.find((item) => item.key === key); if (!provider?.configured) return;
    const chunks = Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) => ids.slice(index * 100, index * 100 + 100));
    const results = await Promise.all(chunks.map((chunk) => provider.client.statuses(chunk).catch(() => ({}))));
    liveByProvider.set(key, Object.assign({}, ...results));
  }));

  return <AppShell admin>
    <div className="section-head"><div><span className="eyebrow">Order infrastructure</span><h1 className="page-heading">Providers and live orders</h1><p className="muted page-lead">Monitor connections and delivery status across every configured provider.</p></div><form action={refreshLiveOrders}><button className="btn primary">Refresh live data</button></form></div>
    <div className="grid3">{health.map((provider) => <article className="glass card stat-card" key={provider.key}><span className="eyebrow">{provider.label}</span><strong className="stat-value" style={{ fontSize: 28 }}>{provider.connected ? "Connected" : provider.configured ? "Action required" : "Not configured"}</strong><span className="muted">{provider.balance ? `${provider.balance.currency} ${provider.balance.balance} · ` : ""}{provider.serviceCount ? `${provider.serviceCount.toLocaleString("en-NG")} synchronized services` : provider.connected ? "Connection verified" : "Connection unavailable"}</span></article>)}</div>
    <section className="glass data-table-wrap" style={{ marginTop: 22 }}><table className="data-table"><thead><tr><th>Order</th><th>Date</th><th>Provider</th><th>External ID</th><th>Service</th><th>Qty</th><th>Charge</th><th>Local status</th><th>Live status</th><th>Start</th><th>Remaining</th><th>Cancellation</th><th>Last update</th><th></th></tr></thead><tbody>{orders.map((item) => {
      const providerKey = normalizeProviderKey(item.get("providerKey")), provider = providers.find((entry) => entry.key === providerKey)!, providerId = item.get("providerOrderId"), live = providerId ? liveByProvider.get(providerKey)?.[String(providerId)] : undefined, refunded = item.get("status") === "refunded", createdAt = item.get("createdAt")?.toDate?.(), lastUpdate = item.get("lastProviderUpdate")?.toDate?.();
      return <tr key={item.id}><td>#{item.id.slice(0, 8)}</td><td>{createdAt ? createdAt.toLocaleString("en-NG") : "—"}</td><td>{item.get("providerLabel") || provider.label}</td><td>{providerId || "Not submitted"}</td><td>{item.get("serviceName")}</td><td>{Number(item.get("quantity") || 0).toLocaleString("en-NG")}</td><td>{formatMoney(BigInt(item.get("customerPriceMinor") || 0), item.get("currency") || "NGN")}</td><td><span className="status-pill">{String(item.get("status") || "unknown").replaceAll("_", " ")}</span></td><td>{live?.status || item.get("providerStatus") || (providerId ? "Unavailable" : "—")}</td><td>{live?.start_count ?? item.get("startCount") ?? "—"}</td><td>{live?.remains ?? item.get("remains") ?? "—"}</td><td>{item.get("cancellationStatus") ? <><span className="status-pill">{String(item.get("cancellationStatus")).replaceAll("_", " ")}</span>{item.get("cancellationStatus") === "provider_confirmation_required" ? <form action={retryCancellation} style={{ marginTop: 8 }}><input type="hidden" name="orderId" value={item.id} /><button className="btn" type="submit">Retry</button></form> : null}</> : "—"}</td><td>{lastUpdate ? lastUpdate.toLocaleString("en-NG") : "—"}</td><td>{refunded ? <span className="status-pill">Refunded</span> : <form action={refundOrder}><input type="hidden" name="orderId" value={item.id} /><button className="btn" type="submit">Refund</button></form>}</td></tr>;
    })}</tbody></table>{orders.length === 0 ? <div className="card"><p className="muted">No customer orders have been created yet.</p></div> : null}</section>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 18 }}><span className="muted">Page {page} · showing {orders.length} of {total.toLocaleString("en-NG")}</span><div style={{ display: "flex", gap: 10 }}>{page > 1 ? <Link className="btn" href={`/admin/provider?page=${page - 1}`}>Previous</Link> : null}{hasNext ? <Link className="btn" href={`/admin/provider?page=${page + 1}`}>Next</Link> : null}</div></div>
  </AppShell>;
}
