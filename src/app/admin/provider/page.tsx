import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";
import { normalizeProviderKey, providerDefinitions } from "@/lib/providers";
import { formatMoney } from "@/lib/money";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { confirmProviderAccepted, confirmProviderRejected, refreshLiveOrders, refreshOrder, refundOrder, retryCancellation, retryProviderSubmissionOnce, verifyProviderOrderHealth } from "./actions";
import { providerReviewAgeBucket } from "@/lib/provider-review-policy";
import { normalizeEmailText } from "@/lib/email";
import { orderProgress } from "@/lib/order-tracking";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;
type PageCursor = { createdAt: number; id: string };
const activeStatuses = ["pending", "processing", "in_progress", "cancel_requested"];
const trackingFilters: Array<{ key: string; label: string; statuses?: string[] }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active", statuses: activeStatuses },
  { key: "pending", label: "Pending", statuses: ["pending"] },
  { key: "processing", label: "Processing", statuses: ["processing"] },
  { key: "in_progress", label: "In progress", statuses: ["in_progress"] },
  { key: "completed", label: "Completed", statuses: ["completed"] },
  { key: "partial", label: "Partial", statuses: ["partial"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
  { key: "failed", label: "Failed", statuses: ["failed"] },
  { key: "needs_confirmation", label: "Needs confirmation", statuses: ["provider_confirmation_required"] },
];

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

export default async function ProviderHealthPage({ searchParams }: { searchParams: Promise<{ after?: string; before?: string; notice?: string; status?: string }> }) {
  await requireAdmin();
  const input = await searchParams, after = decodeCursor(input.after), before = decodeCursor(input.before), db = adminDb();
  const selectedFilter = trackingFilters.find((item) => item.key === input.status) || trackingFilters[0];
  let baseQuery: FirebaseFirestore.Query = db.collection("orders");
  if (selectedFilter.statuses?.length === 1) baseQuery = baseQuery.where("status", "==", selectedFilter.statuses[0]);
  if ((selectedFilter.statuses?.length || 0) > 1) baseQuery = baseQuery.where("status", "in", selectedFilter.statuses!);
  let ordersQuery = baseQuery.orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
  if (after) ordersQuery = ordersQuery.startAfter(Timestamp.fromMillis(after.createdAt), after.id);
  if (before) ordersQuery = ordersQuery.endBefore(Timestamp.fromMillis(before.createdAt), before.id);
  const pagedOrdersQuery = before ? ordersQuery.limitToLast(PAGE_SIZE + 1) : ordersQuery.limit(PAGE_SIZE + 1);
  const [orderSnapshot, countSnapshot, recoverySnapshot, activeCount, completedCount, partialCount, failedCount, confirmationCount, refundReviewCount, trackingHealth] = await Promise.all([
    pagedOrdersQuery.get(),
    baseQuery.count().get(),
    db.collection("orders").where("status", "==", "provider_confirmation_required").orderBy("createdAt", "asc").limit(50).get(),
    db.collection("orders").where("status", "in", activeStatuses).count().get(),
    db.collection("orders").where("status", "==", "completed").count().get(),
    db.collection("orders").where("status", "==", "partial").count().get(),
    db.collection("orders").where("status", "==", "failed").count().get(),
    db.collection("orders").where("status", "==", "provider_confirmation_required").count().get(),
    db.collection("orders").where("refundStatus", "==", "pending_confirmation").count().get(),
    db.collection("trackingHealth").doc("current").get(),
  ]);
  const hasExtra = orderSnapshot.size > PAGE_SIZE;
  const orders = before && hasExtra ? orderSnapshot.docs.slice(1) : orderSnapshot.docs.slice(0, PAGE_SIZE);
  const hasPrevious = Boolean(after || before) && (before ? hasExtra : true);
  const hasNext = before ? true : hasExtra;
  const previousCursor = orders[0] ? cursorFor(orders[0]) : null;
  const nextCursor = orders.at(-1) ? cursorFor(orders.at(-1)!) : null;
  const total = countSnapshot.data().count;
  const recoveryOrders = recoverySnapshot.docs;
  const auditNowMs = recoverySnapshot.readTime.toMillis();
  const providers = providerDefinitions();
  const health = await Promise.all(providers.map(async (provider) => {
    if (!provider.configured) return { ...provider, connectedNow: false as const, balance: null, serviceCount: null, publicServiceCount: null, lastSuccessfulSync: null, orderHealthStatus: "ACTIVE", ambiguousCount: 0 };
    const [balance, syncState, orderHealth] = await Promise.all([
      provider.client.balance().catch(() => null),
      db.collection("providerSyncState").doc(provider.key).get().catch(() => null),
      db.collection("providerOrderHealth").doc(provider.key).get().catch(() => null),
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
      orderHealthStatus: String(orderHealth?.get("status") || "ACTIVE"),
      ambiguousCount: Number(orderHealth?.get("ambiguousCount") || 0),
    };
  }));
  const summary = [
    ["Active orders", activeCount.data().count],
    ["Completed", completedCount.data().count],
    ["Partial", partialCount.data().count],
    ["Failed", failedCount.data().count],
    ["Needs provider confirmation", confirmationCount.data().count],
    ["Refund review", refundReviewCount.data().count],
  ] as const;
  const lastTrackingRun = trackingHealth.get("lastRunAt")?.toDate?.();
  const providerChecks = (trackingHealth.get("checkedByProvider") || {}) as Record<string, unknown>;
  const trackingTransitions = (trackingHealth.get("transitions") || {}) as Record<string, unknown>;

  return <AppShell admin>
    <div className="section-head"><div><span className="eyebrow">Order infrastructure</span><h1 className="page-heading">Providers and live orders</h1><p className="muted page-lead">Monitor connections and delivery status across every configured provider.</p></div><form action={refreshLiveOrders}><button className="btn primary">Refresh live data</button></form></div>
    {input.notice === "provider-confirmed" ? <div className="notice" role="status" style={{ marginBottom: 18 }}><strong>Provider confirmation recovered.</strong> The verified external order is now tracked by the normal status synchronizer.</div> : null}
    {input.notice === "provider-rejected" ? <div className="notice" role="status" style={{ marginBottom: 18 }}><strong>Provider rejection resolved.</strong> The remaining verified charge was returned without resubmitting the order.</div> : null}
    {input.notice === "provider-review" ? <div className="notice" role="status" style={{ marginBottom: 18 }}><strong>The single retry remains under review.</strong> No further provider submission will be attempted.</div> : null}
    {input.notice === "provider-health-verified" ? <div className="notice" role="status" style={{ marginBottom: 18 }}><strong>Provider health verified.</strong> New orders may use this provider again.</div> : null}
    <section className="glass card" style={{ marginBottom: 22 }}>
      <div className="section-head"><div><span className="eyebrow">Tracking health</span><h2>{lastTrackingRun ? `Last run ${lastTrackingRun.toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}` : "No complete tracking run recorded"}</h2></div><span className="status-pill">{String(trackingHealth.get("lastRunSource") || "waiting").replaceAll("_", " ")}</span></div>
      <div className="grid3">
        <span><strong>{Number(trackingHealth.get("activeDiscovered") || 0).toLocaleString("en-NG")}</strong><br /><span className="muted">Orders discovered</span></span>
        <span><strong>{Number(trackingHealth.get("checked") || 0).toLocaleString("en-NG")}</strong><br /><span className="muted">Orders checked</span></span>
        <span><strong>{Number(trackingHealth.get("updated") || 0).toLocaleString("en-NG")}</strong><br /><span className="muted">Statuses updated</span></span>
        <span><strong>{Number(trackingHealth.get("completedDetected") || 0).toLocaleString("en-NG")}</strong><br /><span className="muted">Completed detected</span></span>
        <span><strong>{Number(trackingHealth.get("partialDetected") || 0).toLocaleString("en-NG")}</strong><br /><span className="muted">Partial detected</span></span>
        <span><strong>{Number(trackingHealth.get("providerBatches") || 0).toLocaleString("en-NG")}</strong><br /><span className="muted">Provider status calls</span></span>
        <span><strong>{Number(trackingHealth.get("providerFailures") || 0).toLocaleString("en-NG")}</strong><br /><span className="muted">Provider failures</span></span>
        <span><strong>{Number(trackingHealth.get("neverCheckedRemaining") || 0).toLocaleString("en-NG")}</strong><br /><span className="muted">Never checked remaining</span></span>
        <span><strong>{Number(trackingHealth.get("runDurationMs") || 0).toLocaleString("en-NG")} ms</strong><br /><span className="muted">Run duration</span></span>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>Provider checks: {providers.map((provider) => `${provider.label} ${Number(providerChecks[provider.key] || 0).toLocaleString("en-NG")}`).join(" · ")}</p>
      <p className="muted" style={{ marginBottom: 0 }}>Status changes: {Object.keys(trackingTransitions).length ? Object.entries(trackingTransitions).map(([transition, count]) => `${transition.replace("->", " → ")} ${Number(count).toLocaleString("en-NG")}`).join(" · ") : "none"}</p>
    </section>
    <div className="grid3">{summary.map(([label, value]) => <article className="glass card stat-card" key={label}><span className="eyebrow">Tracking</span><strong className="stat-value">{value.toLocaleString("en-NG")}</strong><span className="muted">{label}</span></article>)}</div>
    <div className="grid3">{health.map((provider) => <article className="glass card stat-card" key={provider.key}><span className="eyebrow">{provider.label}</span><strong className="stat-value" style={{ fontSize: 28 }}>{provider.orderHealthStatus === "DEGRADED" ? "DEGRADED" : provider.connectedNow ? "Connected now" : provider.configured ? "Temporarily unreachable" : "Not configured"}</strong><span className="muted">Order safety: {provider.orderHealthStatus} · {provider.ambiguousCount} recent ambiguous submission(s)</span><span className="muted">Configuration: {provider.configured ? "configured" : "missing"}</span><span className="muted">{provider.balance ? `Live balance ${provider.balance.currency} ${provider.balance.balance}` : "Live balance unavailable"}</span><span className="muted">{provider.serviceCount === null ? "Synchronized service count unavailable" : `${provider.serviceCount.toLocaleString("en-NG")} synchronized`}{provider.publicServiceCount === null ? " · public eligible count unavailable" : ` · ${provider.publicServiceCount.toLocaleString("en-NG")} public eligible`}</span><span className="muted">Last successful sync: {provider.lastSuccessfulSync?.toLocaleString("en-NG", { timeZone: "Africa/Lagos" }) || "not recorded"}</span>{provider.orderHealthStatus === "DEGRADED" ? <form action={verifyProviderOrderHealth} style={{ display: "grid", gap: 8 }}><input type="hidden" name="providerKey" value={provider.key} /><label><input type="checkbox" name="confirmed" value="yes" required /> Run a read-only balance verification and reactivate only if successful.</label><button className="btn" type="submit">Verify provider health</button></form> : null}</article>)}</div>
    <section className="glass card" style={{ marginTop: 22 }}>
      <div className="section-head"><div><span className="eyebrow">Duplicate-order protection</span><h2>Orders requiring provider confirmation</h2></div><span className="status-pill">{confirmationCount.data().count} awaiting review</span></div>
      <p className="muted">Use the provider dashboard to locate the original submission. Attaching an order performs a read-only status check. The separate retry action calls the provider exactly once and is available only after an administrator confirms no upstream order exists.</p>
      {recoveryOrders.length ? <div className="card" style={{ marginBottom: 16 }}><strong>Read-only queue audit</strong><p className="muted" style={{ marginBottom: 0 }}>{Array.from(new Map(recoveryOrders.map((order) => [normalizeProviderKey(order.get("providerKey")), recoveryOrders.filter((item) => normalizeProviderKey(item.get("providerKey")) === normalizeProviderKey(order.get("providerKey")))]))).map(([key, items]) => `${providers.find((provider) => provider.key === key)?.label || key}: ${items.length} (${Object.entries(items.reduce<Record<string, number>>((counts, item) => { const created = item.get("createdAt")?.toMillis?.() || auditNowMs; const bucket = providerReviewAgeBucket(auditNowMs - created); counts[bucket] = (counts[bucket] || 0) + 1; return counts; }, {})).map(([bucket, count]) => `${bucket} ${count}`).join(", ")})`).join(" · ")}</p></div> : null}
      {recoveryOrders.length === 0 ? <p>No ambiguous submissions need review.</p> : <div style={{ display: "grid", gap: 16 }}>{recoveryOrders.map((order) => {
        const provider = providers.find((item) => item.key === normalizeProviderKey(order.get("providerKey")))!;
        const rawClaimedDecision = String(order.get("providerConfirmationDecision") || "");
        const claimedAtMs = order.get("providerConfirmationClaimedAt")?.toMillis?.() || auditNowMs;
        const claimedDecision = rawClaimedDecision === "retry" && auditNowMs - claimedAtMs >= 10 * 60 * 1000 ? "" : rawClaimedDecision;
        const claimedExternalId = Number(order.get("providerConfirmationExternalId"));
        const reviewNote = String(order.get("providerConfirmationReviewNote") || "");
        const createdAt = order.get("createdAt")?.toDate?.();
        const attemptAt = order.get("submissionLastAttemptAt")?.toDate?.() || order.get("providerConfirmationRequiredAt")?.toDate?.() || createdAt;
        return <article className="card" key={order.id} style={{ border: "1px solid var(--border)" }}>
          <div className="section-head"><div><strong>#{order.id.slice(0, 8)} · {normalizeEmailText(order.get("serviceName"))}</strong><p className="muted" style={{ marginBottom: 0 }}>{provider.label} · {Number(order.get("quantity") || 0).toLocaleString("en-NG")} units · {formatMoney(BigInt(order.get("customerPriceMinor") || 0), order.get("currency") || "NGN")}</p></div>{claimedDecision ? <span className="status-pill">{claimedDecision} recovery in progress</span> : null}</div>
          <p className="muted">Internal: service {String(order.get("providerServiceId") || "—")} · target {String(order.get("link") || "—")} · provider cost {formatMoney(BigInt(order.get("providerCostMinor") || 0), order.get("currency") || "NGN")} · attempt {attemptAt?.toLocaleString("en-NG", { timeZone: "Africa/Lagos" }) || "—"} · {String(order.get("providerErrorCode") || "UNKNOWN")} · age {providerReviewAgeBucket(auditNowMs - (createdAt?.getTime?.() || auditNowMs))}</p>
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
              <button className="btn" type="submit">Refund and close</button>
            </form> : null}
            {!order.get("providerConfirmationRetryUsed") && !claimedDecision ? <form action={retryProviderSubmissionOnce} style={{ display: "grid", gap: 10 }}>
              <input type="hidden" name="orderId" value={order.id} />
              <label>Provider-dashboard verification note<textarea className="field" name="note" rows={3} minLength={10} maxLength={500} required /></label>
              <label><input type="checkbox" name="confirmed" value="yes" required /> I checked the upstream provider, confirmed no order exists, and authorize exactly one retry.</label>
              <button className="btn" type="submit">Confirm not created and retry once</button>
            </form> : null}
          </div>
        </article>;
      })}</div>}
      {recoverySnapshot.size === 50 ? <p className="muted" style={{ marginBottom: 0, marginTop: 14 }}>Showing the oldest 50 recovery items. Resolve these before loading more.</p> : null}
    </section>
    <div className="order-filters" style={{ marginTop: 22 }}>{trackingFilters.map((filter) => <Link className={`btn${selectedFilter.key === filter.key ? " primary" : ""}`} href={`/admin/provider?status=${filter.key}`} key={filter.key}>{filter.label}</Link>)}</div>
    <section className="glass data-table-wrap" style={{ marginTop: 22 }}><table className="data-table"><thead><tr><th>Order</th><th>Date</th><th>Provider</th><th>External ID</th><th>Service</th><th>Qty</th><th>Delivered</th><th>Charge</th><th>Local status</th><th>Provider status</th><th>Start</th><th>Remaining</th><th>Progress</th><th>Refund</th><th>Cancellation</th><th>Last update</th><th></th></tr></thead><tbody>{orders.map((item) => {
      const providerKey = normalizeProviderKey(item.get("providerKey")), provider = providers.find((entry) => entry.key === providerKey), providerId = item.get("providerOrderId"), refunded = item.get("status") === "refunded", createdAt = item.get("createdAt")?.toDate?.(), lastUpdate = item.get("lastProviderUpdate")?.toDate?.();
      const progress = orderProgress({ quantity: item.get("quantity"), remains: item.get("remains"), status: item.get("status") });
      const needsConfirmation = item.get("status") === "provider_confirmation_required";
      const activeProviderBacked = activeStatuses.includes(String(item.get("status"))) && Number.isInteger(providerId);
      return <tr key={item.id}><td>#{item.id.slice(0, 8)}</td><td>{createdAt ? createdAt.toLocaleString("en-NG", { timeZone: "Africa/Lagos" }) : "—"}</td><td>{item.get("providerLabel") || provider?.label || providerKey}</td><td>{providerId || "Not submitted"}</td><td>{normalizeEmailText(item.get("serviceName"))}</td><td>{Number(item.get("quantity") || 0).toLocaleString("en-NG")}</td><td>{progress.delivered ?? "—"}</td><td>{formatMoney(BigInt(item.get("customerPriceMinor") || 0), item.get("currency") || "NGN")}</td><td><span className="status-pill">{String(item.get("status") || "unknown").replaceAll("_", " ")}</span></td><td>{item.get("providerStatus") || (providerId ? "Awaiting refresh" : "—")}</td><td>{item.get("startCount") ?? "—"}</td><td>{item.get("status") === "completed" ? 0 : item.get("remains") ?? "—"}</td><td>{progress.percent === null ? "Waiting" : `${progress.percent}%`}</td><td>{item.get("refundStatus") ? <span className="status-pill">{String(item.get("refundStatus")).replaceAll("_", " ")}</span> : "—"}</td><td>{item.get("cancellationStatus") ? <><span className="status-pill">{String(item.get("cancellationStatus")).replaceAll("_", " ")}</span>{item.get("cancellationStatus") === "provider_confirmation_required" ? <form action={retryCancellation} style={{ marginTop: 8 }}><input type="hidden" name="orderId" value={item.id} /><button className="btn" type="submit">Retry</button></form> : null}</> : "—"}</td><td>{lastUpdate ? lastUpdate.toLocaleString("en-NG", { timeZone: "Africa/Lagos" }) : "Never checked"}</td><td>{refunded ? <span className="status-pill">Refunded</span> : needsConfirmation ? <span className="status-pill">Use recovery queue</span> : activeProviderBacked ? <form action={refreshOrder}><input type="hidden" name="orderId" value={item.id} /><button className="btn" type="submit">Verify live status</button></form> : <form action={refundOrder}><input type="hidden" name="orderId" value={item.id} /><button className="btn" type="submit">Refund</button></form>}</td></tr>;
    })}</tbody></table>{orders.length === 0 ? <div className="card"><p className="muted">No customer orders have been created yet.</p></div> : null}</section>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 18 }}><span className="muted">Showing {orders.length} of {total.toLocaleString("en-NG")} {selectedFilter.label.toLowerCase()} orders</span><div style={{ display: "flex", gap: 10 }}>{hasPrevious && previousCursor ? <Link className="btn" href={`/admin/provider?status=${selectedFilter.key}&before=${encodeURIComponent(previousCursor)}`}>Previous</Link> : null}{hasNext && nextCursor ? <Link className="btn" href={`/admin/provider?status=${selectedFilter.key}&after=${encodeURIComponent(nextCursor)}`}>Next</Link> : null}</div></div>
  </AppShell>;
}
