import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";
import { normalizeProviderKey, providerDefinitions } from "@/lib/providers";
import { formatMoney } from "@/lib/money";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { confirmProviderAccepted, confirmProviderRejected, refreshLiveOrders, refundOrder, retryCancellation } from "./actions";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;
type LiveStatus = { status: string; start_count?: string; remains?: string };
type PageCursor = { createdAt: number; id: string };

function encodeCursor(cursor: PageCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value?: string): PageCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<PageCursor>;
    return Number.isFinite(parsed.createdAt) && typeof parsed.id === "string" && parsed.id.length > 0
      ? { createdAt: Number(parsed.createdAt), id: parsed.id }
      : null;
  } catch {
    return null;
  }
}

function cursorFor(document: FirebaseFirestore.QueryDocumentSnapshot) {
  const createdAt = document.get("createdAt")?.toMillis?.();
  return Number.isFinite(createdAt) ? encodeCursor({ createdAt, id: document.id }) : null;
}

export default async function ProviderHealthPage({ searchParams }: { searchParams: Promise<{ after?: string; before?: string; notice?: string }> }) {
  await requireAdmin();
  const input = await searchParams, after = decodeCursor(input.after), before = decodeCursor(input.before), db = adminDb();
  let ordersQuery = db.collection("orders").orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
  if (after) ordersQuery = ordersQuery.startAfter(Timestamp.fromMillis(after.createdAt), after.id);
  if (before) ordersQuery = ordersQuery.endBefore(Timestamp.fromMillis(before.createdAt), before.id);
  const pagedOrdersQuery = before ? ordersQuery.limitToLast(PAGE_SIZE + 1) : ordersQuery.limit(PAGE_SIZE + 1);
  const [orderSnapshot, countSnapshot, recoverySnapshot] = await Promise.all([
    pagedOrdersQuery.get(),
    db.collection("orders").count().get(),
    db.collection("orders").where("status", "==", "provider_confirmation_required").limit(25).get(),
  ]);
  const hasExtra = orderSnapshot.size > PAGE_SIZE;
  const orders = before && hasExtra ? orderSnapshot.docs.slice(1) : orderSnapshot.docs.slice(0, PAGE_SIZE);
  const hasPrevious = Boolean(after || before) && (before ? hasExtra : true);
  const hasNext = before ? true : hasExtra;
  const previousCursor = orders[0] ? cursorFor(orders[0]) : null;
  const nextCursor = orders.at(-1) ? cursorFor(orders.at(-1)!) : null;
  const total = countSnapshot.data().count;
  const recoveryOrders = recoverySnapshot.docs;
  const providers = providerDefinitions();
  const health = await Promise.all(providers.map(async (provider) => {
    if (!provider.configured) return { ...provider, connectedNow: false as const, balance: null, serviceCount: null, publicServiceCount: null, lastSuccessfulSync: null };
    const [balance, syncState] = await Promise.all([
      provider.client.balance().catch(() => null),
      db.collection("providerSyncState").doc(provider.key).get().catch(() => null),
    ]);
    const storedCount = Number(syncState?.get("serviceCount"));
    const publicCount = Number(syncState?.get("publicServiceCount"));
    return {
      ...provider,
      connectedNow: Boolean(balance),
      balance,
      serviceCount: Number.isSafeInteger(storedCount) && storedCount >= 0 ? storedCount : null,
      publicServiceCount: Number.isSafeInteger(publicCount) && publicCount >= 0 ? publicCount : null,
      lastSuccessfulSync: syncState?.get("completedAt")?.toDate?.() || null,
    };
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
    {input.notice === "provider-confirmed" ? <div className="notice" role="status" style={{ marginBottom: 18 }}><strong>Provider confirmation recovered.</strong> The verified external order is now tracked by the normal status synchronizer.</div> : null}
    {input.notice === "provider-rejected" ? <div className="notice" role="status" style={{ marginBottom: 18 }}><strong>Provider rejection resolved.</strong> The remaining verified charge was returned without resubmitting the order.</div> : null}
    <div className="grid3">{health.map((provider) => <article className="glass card stat-card" key={provider.key}><span className="eyebrow">{provider.label}</span><strong className="stat-value" style={{ fontSize: 28 }}>{provider.connectedNow ? "Connected now" : provider.configured ? "Temporarily unreachable" : "Not configured"}</strong><span className="muted">Configuration: {provider.configured ? "configured" : "missing"}</span><span className="muted">{provider.balance ? `Live balance ${provider.balance.currency} ${provider.balance.balance}` : "Live balance unavailable"}</span><span className="muted">{provider.serviceCount === null ? "Synchronized service count unavailable" : `${provider.serviceCount.toLocaleString("en-NG")} synchronized`}{provider.publicServiceCount === null ? " · public eligible count unavailable" : ` · ${provider.publicServiceCount.toLocaleString("en-NG")} public eligible`}</span><span className="muted">Last successful sync: {provider.lastSuccessfulSync?.toLocaleString("en-NG", { timeZone: "Africa/Lagos" }) || "not recorded"}</span></article>)}</div>
    <section className="glass card" style={{ marginTop: 22 }}>
      <div className="section-head"><div><span className="eyebrow">Duplicate-order protection</span><h2>Provider confirmation recovery</h2></div><span className="status-pill">{recoveryOrders.length} awaiting review</span></div>
      <p className="muted">Use the provider dashboard to locate the original submission. Recovery performs a read-only status check; it never submits the order again. Reject only after confirming that no upstream order exists.</p>
      {recoveryOrders.length === 0 ? <p>No ambiguous submissions need review.</p> : <div style={{ display: "grid", gap: 16 }}>{recoveryOrders.map((order) => {
        const provider = providers.find((item) => item.key === normalizeProviderKey(order.get("providerKey")))!;
        const claimedDecision = String(order.get("providerConfirmationDecision") || "");
        const claimedExternalId = Number(order.get("providerConfirmationExternalId"));
        const reviewNote = String(order.get("providerConfirmationReviewNote") || "");
        return <article className="card" key={order.id} style={{ border: "1px solid var(--border)" }}>
          <div className="section-head"><div><strong>#{order.id.slice(0, 8)} · {order.get("serviceName")}</strong><p className="muted" style={{ marginBottom: 0 }}>{provider.label} · {Number(order.get("quantity") || 0).toLocaleString("en-NG")} units · {formatMoney(BigInt(order.get("customerPriceMinor") || 0), order.get("currency") || "NGN")}</p></div>{claimedDecision ? <span className="status-pill">{claimedDecision} recovery in progress</span> : null}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 14 }}>
            {claimedDecision !== "rejected" ? <form action={confirmProviderAccepted} style={{ display: "grid", gap: 10 }}>
              <input type="hidden" name="orderId" value={order.id} />
              <label>Verified external order ID<input className="field" name="providerOrderId" inputMode="numeric" pattern="[0-9]+" defaultValue={Number.isSafeInteger(claimedExternalId) && claimedExternalId > 0 ? claimedExternalId : undefined} required /></label>
              <label>Provider-dashboard review note<textarea className="field" name="note" rows={3} minLength={10} maxLength={500} defaultValue={reviewNote} required /></label>
              <label><input type="checkbox" name="confirmed" value="yes" required /> I verified this exact order in the provider dashboard.</label>
              <button className="btn primary" type="submit">Attach confirmed order</button>
            </form> : null}
            {claimedDecision !== "accepted" ? <form action={confirmProviderRejected} style={{ display: "grid", gap: 10 }}>
              <input type="hidden" name="orderId" value={order.id} />
              <label>Non-acceptance evidence<textarea className="field" name="note" rows={3} minLength={10} maxLength={500} defaultValue={reviewNote} required /></label>
              <label><input type="checkbox" name="confirmed" value="yes" required /> I confirmed no upstream order exists and approve the remaining refund.</label>
              <button className="btn" type="submit">Mark not accepted and refund</button>
            </form> : null}
          </div>
        </article>;
      })}</div>}
      {recoverySnapshot.size === 25 ? <p className="muted" style={{ marginBottom: 0, marginTop: 14 }}>Showing the first 25 recovery items. Resolve these before loading more.</p> : null}
    </section>
    <section className="glass data-table-wrap" style={{ marginTop: 22 }}><table className="data-table"><thead><tr><th>Order</th><th>Date</th><th>Provider</th><th>External ID</th><th>Service</th><th>Qty</th><th>Charge</th><th>Local status</th><th>Live status</th><th>Start</th><th>Remaining</th><th>Cancellation</th><th>Last update</th><th></th></tr></thead><tbody>{orders.map((item) => {
      const providerKey = normalizeProviderKey(item.get("providerKey")), provider = providers.find((entry) => entry.key === providerKey)!, providerId = item.get("providerOrderId"), live = providerId ? liveByProvider.get(providerKey)?.[String(providerId)] : undefined, refunded = item.get("status") === "refunded", createdAt = item.get("createdAt")?.toDate?.(), lastUpdate = item.get("lastProviderUpdate")?.toDate?.();
      const needsConfirmation = item.get("status") === "provider_confirmation_required";
      return <tr key={item.id}><td>#{item.id.slice(0, 8)}</td><td>{createdAt ? createdAt.toLocaleString("en-NG") : "—"}</td><td>{item.get("providerLabel") || provider.label}</td><td>{providerId || "Not submitted"}</td><td>{item.get("serviceName")}</td><td>{Number(item.get("quantity") || 0).toLocaleString("en-NG")}</td><td>{formatMoney(BigInt(item.get("customerPriceMinor") || 0), item.get("currency") || "NGN")}</td><td><span className="status-pill">{String(item.get("status") || "unknown").replaceAll("_", " ")}</span></td><td>{live?.status || item.get("providerStatus") || (providerId ? "Unavailable" : "—")}</td><td>{live?.start_count ?? item.get("startCount") ?? "—"}</td><td>{live?.remains ?? item.get("remains") ?? "—"}</td><td>{item.get("cancellationStatus") ? <><span className="status-pill">{String(item.get("cancellationStatus")).replaceAll("_", " ")}</span>{item.get("cancellationStatus") === "provider_confirmation_required" ? <form action={retryCancellation} style={{ marginTop: 8 }}><input type="hidden" name="orderId" value={item.id} /><button className="btn" type="submit">Retry</button></form> : null}</> : "—"}</td><td>{lastUpdate ? lastUpdate.toLocaleString("en-NG") : "—"}</td><td>{refunded ? <span className="status-pill">Refunded</span> : needsConfirmation ? <span className="status-pill">Use recovery queue</span> : <form action={refundOrder}><input type="hidden" name="orderId" value={item.id} /><button className="btn" type="submit">Refund</button></form>}</td></tr>;
    })}</tbody></table>{orders.length === 0 ? <div className="card"><p className="muted">No customer orders have been created yet.</p></div> : null}</section>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 18 }}><span className="muted">Showing {orders.length} of {total.toLocaleString("en-NG")} orders</span><div style={{ display: "flex", gap: 10 }}>{hasPrevious && previousCursor ? <Link className="btn" href={`/admin/provider?before=${encodeURIComponent(previousCursor)}`}>Previous</Link> : null}{hasNext && nextCursor ? <Link className="btn" href={`/admin/provider?after=${encodeURIComponent(nextCursor)}`}>Next</Link> : null}</div></div>
  </AppShell>;
}
