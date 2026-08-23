import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";
import { FollowsPanelClient } from "@/lib/providers/followspanel";
import { formatMoney } from "@/lib/money";
import { refundOrder } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProviderHealthPage() {
  await requireAdmin();
  const client = new FollowsPanelClient();
  const orderSnapshot = await adminDb().collection("orders").limit(100).get();
  const orders = orderSnapshot.docs.sort((a, b) => (b.get("createdAt")?.toMillis?.() || 0) - (a.get("createdAt")?.toMillis?.() || 0)).slice(0, 20);
  const providerIds = orders.map((item) => item.get("providerOrderId")).filter((value): value is number => Number.isInteger(value));
  const [balanceResult, servicesResult, statusesResult] = await Promise.allSettled([client.balance(), client.services(), providerIds.length ? client.statuses(providerIds) : Promise.resolve({})]);
  const balance = balanceResult.status === "fulfilled" ? balanceResult.value : null;
  const services = servicesResult.status === "fulfilled" ? servicesResult.value : null;
  const statuses: Record<string, { status: string; start_count?: string; remains?: string }> = statusesResult.status === "fulfilled" ? statusesResult.value : {};
  const connected = Boolean(balance && services);
  let endpoint = "Not configured";
  try { endpoint = new URL(process.env.FOLLOWSPANEL_API_URL || "").host; } catch {}
  return <AppShell admin><span className="eyebrow">Live supplier connection</span><h1 className="page-heading">Followpanel health</h1><p className="muted page-lead">This page reads the same API account used for customer orders. It never displays the API key.</p><div className="grid3"><article className="glass card stat-card"><span className="muted">Connection</span><strong className="stat-value" style={{ fontSize: 28 }}>{connected ? "Connected" : "Action required"}</strong></article><article className="glass card stat-card"><span className="muted">API account balance</span><strong className="stat-value" style={{ fontSize: 28 }}>{balance ? `${balance.currency} ${balance.balance}` : "Unavailable"}</strong></article><article className="glass card stat-card"><span className="muted">Available services</span><strong className="stat-value" style={{ fontSize: 28 }}>{services ? services.length.toLocaleString("en-NG") : "Unavailable"}</strong></article></div><div className={`notice${connected ? "" : " danger"}`} style={{ margin: "22px 0" }}><strong>{connected ? `Connected to ${endpoint}` : "Followpanel API connection failed"}</strong><p className="muted" style={{ marginBottom: 0 }}>{connected ? "Compare the balance above with the balance shown in the Followpanel account you are viewing. If they differ, the Vercel API key belongs to another account." : "Confirm FOLLOWSPANEL_API_URL and replace FOLLOWSPANEL_API_KEY in Vercel with the key copied from the intended Followpanel account."}</p></div><section className="glass data-table-wrap"><table className="data-table"><thead><tr><th>Social Booster order</th><th>Followpanel order</th><th>Service</th><th>Charge</th><th>Local status</th><th>Live status</th><th>Start</th><th>Remaining</th><th></th></tr></thead><tbody>{orders.map((item) => { const providerId = item.get("providerOrderId"); const live = providerId ? statuses[String(providerId)] : undefined; const refunded = item.get("status") === "refunded"; return <tr key={item.id}><td>#{item.id.slice(0, 8)}</td><td>{providerId || "Not submitted"}</td><td>{item.get("serviceName")}</td><td>{formatMoney(BigInt(item.get("customerPriceMinor") || 0), item.get("currency") || "NGN")}</td><td>{String(item.get("status") || "unknown").replaceAll("_", " ")}</td><td>{live?.status || (providerId ? "Unavailable" : "—")}</td><td>{live?.start_count ?? "—"}</td><td>{live?.remains ?? "—"}</td><td>{refunded ? <span className="status-pill">Refunded</span> : <form action={refundOrder}><input type="hidden" name="orderId" value={item.id} /><button className="btn" type="submit">Refund order</button></form>}</td></tr>; })}</tbody></table>{orders.length === 0 ? <div className="card"><p className="muted">No customer orders have been created yet.</p></div> : null}</section></AppShell>;
}
