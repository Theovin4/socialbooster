import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/firebase/session";
import { loadFinanceDashboardData } from "@/lib/finance-data";
import { formatMoney } from "@/lib/money";
import { Toast } from "@/components/toast";
import { rebuildFinanceAction, reconcileFinanceAction } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const statuses = [
  "all",
  "submitting",
  "provider_confirmation_required",
  "pending",
  "processing",
  "in_progress",
  "cancel_requested",
  "completed",
  "partial",
  "cancelled",
  "failed",
  "refunded",
];
const money = (value: number) => formatMoney(BigInt(Math.round(value)), "NGN");

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    status?: string;
    repair?: string;
  }>;
}) {
  await requireAdmin();
  const filters = await searchParams,
    range = filters.range || "30d",
    status = filters.status || "all";
  const data = await loadFinanceDashboardData({ ...filters, range, status });
  const summary = data.summary;
  const rollupsAvailable = data.availability.rollups && summary !== null;
  const ordersAvailable = data.availability.recentOrders;
  const byDay = new Map<string, number>();
  for (const row of data.daily) {
    const key = String(row.dateKey || "");
    if (key) byDay.set(key, Number(row.orderValueMinor || 0));
  }
  const trend = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-31),
    maxSales = Math.max(1, ...trend.map(([, value]) => value));
  const byCategory = new Map<
    string,
    { sales: number; cost: number; orders: number }
  >();
  for (const order of data.orders) {
    const current = byCategory.get(order.category) || {
      sales: 0,
      cost: 0,
      orders: 0,
    };
    current.sales += order.customerPriceMinor;
    current.cost += order.providerAccepted || Number.isInteger(order.providerOrderId)
      ? order.providerCostIncurredMinor ?? order.providerCostMinor
      : 0;
    current.orders += 1;
    byCategory.set(order.category, current);
  }
  const categories = [...byCategory.entries()]
    .sort((a, b) => b[1].sales - a[1].sales)
    .slice(0, 10);
  const exportQuery = new URLSearchParams({
    range,
    status,
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
  }).toString();
  const cards: Array<[string, number | null]> = [
    [
      "Verified customer deposits",
      rollupsAvailable ? summary?.depositsMinor ?? null : null,
    ],
    ["Order value", rollupsAvailable ? summary?.orderValueMinor ?? null : null],
    ["Net sales", rollupsAvailable ? summary?.netSalesMinor ?? null : null],
    [
      "Capital deployed",
      rollupsAvailable ? summary?.capitalDeployedMinor ?? null : null,
    ],
    [
      "Gross profit",
      rollupsAvailable ? summary?.grossProfitMinor ?? null : null,
    ],
    [
      "Current NGN wallet liability",
      rollupsAvailable ? summary?.walletLiabilityMinor ?? null : null,
    ],
  ];
  const healthLabel = data.health.available
    ? data.health.lastReconciliationStatus === "MATCH" ? "Finance data healthy" : "Finance reconciliation required"
    : "Finance rollup rebuild required";
  const definitions: Record<string, string> = {
    "Verified customer deposits": "Successfully verified customer wallet funding. This is cash inflow, not revenue.",
    "Order value": "Customer order charges before refunds.",
    "Net sales": "Order charges less customer order refunds.",
    "Capital deployed": "Provider cost actually incurred on provider-accepted orders.",
    "Gross profit": "Net sales less provider costs incurred. Excludes payment fees, tax and other operating expenses.",
    "Current NGN wallet liability": "Total unused NGN customer wallet funds currently owed to customers.",
  };
  return (
    <AppShell admin>
      {filters.repair === "rebuilt" ? <Toast type="success" title="Finance rollups rebuilt" message="Historical daily data and global totals were reconstructed from authoritative records." /> : null}
      {filters.repair === "matched" ? <Toast type="success" title="Finance reconciliation matched" message="Trusted rollups agree with the authoritative aggregates." /> : null}
      {filters.repair === "drift" ? <Toast type="error" title="Finance drift detected" message="No values were overwritten. Run the controlled rebuild after reviewing the reconciliation details." /> : null}
      {filters.repair?.endsWith("failed") ? <Toast type="error" title="Finance operation failed" message="No financial ledger entries were changed. Review the server logs before retrying." /> : null}
      <div className="section-head">
        <div>
          <h1 className="page-heading">Finance</h1>
        </div>
        <a
          className="btn primary"
          href={`/api/admin/finance/export?${exportQuery}`}
        >
          Download Excel
        </a>
      </div>
      <form className="glass card finance-filters">
        <label>
          Period
          <select className="field" name="range" defaultValue={range}>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
        </label>
        <label>
          From
          <input
            className="field"
            type="date"
            name="from"
            defaultValue={filters.from}
          />
        </label>
        <label>
          To
          <input
            className="field"
            type="date"
            name="to"
            defaultValue={filters.to}
          />
        </label>
        <label>
          Order status
          <select className="field" name="status" defaultValue={status}>
            {statuses.map((item) => (
              <option value={item} key={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit">
          Apply filters
        </button>
        <Link className="btn" href="/admin/finance">
          Reset
        </Link>
      </form>
      <div className="notice" style={{ marginTop: 18 }}>
        <div className="section-head">
          <div><strong>{healthLabel}</strong><p className="muted" style={{ marginBottom: 0 }}>Rollup version {data.health.financeRollupVersion ?? "unavailable"} · Historical backfill {data.health.historicalBackfillComplete ? "complete" : "required"} · Last reconciled {data.health.lastReconciledAt?.toLocaleString("en-NG", { timeZone: "Africa/Lagos" }) || "not yet"}.</p></div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <form action={reconcileFinanceAction}><button className="btn" type="submit">Run reconciliation</button></form>
            <form action={rebuildFinanceAction}><button className="btn" type="submit">Rebuild trusted rollups</button></form>
          </div>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>Normal reporting reads compact monthly rollups plus at most 25 recent matching orders. Rebuild and reconciliation run only when an administrator explicitly requests them.</p>
      </div>
      {status !== "all" ? <div className="notice" style={{ marginTop: 12 }}><strong>Status-filtered order metrics</strong><p className="muted" style={{ marginBottom: 0 }}>Order value, refunds, net sales, provider cost, profit, order count and trend reflect {status.replaceAll("_", " ")} orders. Verified deposits and current wallet liability remain global because they do not belong to an order status.</p></div> : null}
      <div className="finance-kpis">
        {cards.map(([label, value]) => (
          <article className="glass card stat-card" key={label} title={definitions[label]}>
            <span className="muted">{label}</span>
            <strong className="stat-value finance-value">{value === null ? "Unavailable" : money(value)}</strong>
          </article>
        ))}
      </div>
      <div className="finance-kpis compact">
        <article className="glass card">
          <span className="muted">Gross margin</span>
          <strong>{rollupsAvailable ? summary?.grossMarginBps === null ? "N/A" : `${((summary?.grossMarginBps || 0) / 100).toFixed(1)}%` : "Unavailable"}</strong>
        </article>
        <article className="glass card">
          <span className="muted">Refunds</span>
          <strong>{rollupsAvailable ? money(summary?.refundsMinor || 0) : "Unavailable"}</strong>
        </article>
        <article className="glass card">
          <span className="muted">Active capital</span>
          <strong>{rollupsAvailable ? money(summary?.activeCapitalMinor || 0) : "Unavailable"}</strong>
        </article>
        <article className="glass card">
          <span className="muted">Orders</span>
          <strong>{rollupsAvailable ? summary?.orderCount.toLocaleString("en-NG") : "Unavailable"}</strong>
        </article>
        <article className="glass card">
          <span className="muted">Completed</span>
          <strong>{rollupsAvailable ? summary?.completedOrders.toLocaleString("en-NG") : "Unavailable"}</strong>
        </article>
      </div>
      <div className="form-grid" style={{ marginTop: 22 }}>
        <section className="glass card">
          <span className="eyebrow">Performance trend</span>
          <h2>Daily order value</h2>
          {trend.length ? (
            <div className="finance-chart" aria-label="Daily order value chart">
              {trend.map(([day, value]) => (
                <div
                  className="finance-bar-column"
                  key={day}
                  title={`${day}: ${money(value)}`}
                >
                  <div
                    className="finance-bar"
                    style={{
                      height: `${Math.max(4, (value * 100) / maxSales)}%`,
                    }}
                  />
                  <span>{day.slice(5)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{ordersAvailable ? "No order activity in this period." : "Order activity is being refreshed."}</p>
          )}
        </section>
        <section className="glass card">
          <span className="eyebrow">Sales mix</span>
          <h2>Categories in recent matching orders</h2>
          {categories.length ? (
            categories.map(([category, item]) => (
              <div className="finance-category" key={category}>
                <div>
                  <strong>{category}</strong>
                  <span className="muted">{item.orders} orders</span>
                </div>
                <div>
                  <strong>{money(item.sales)}</strong>
                  <span className="muted">
                    Profit {money(item.sales - item.cost)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">{ordersAvailable ? "No category activity in this period." : "Category activity is being refreshed."}</p>
          )}
        </section>
      </div>
      <section className="glass data-table-wrap" style={{ marginTop: 22 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Date</th>
              <th>Service</th>
              <th>Status</th>
              <th>Quantity</th>
              <th>Customer charge</th>
              <th>Provider cost incurred</th>
              <th>Quoted gross profit</th>
            </tr>
          </thead>
          <tbody>
            {data.orders
              .sort(
                (a, b) =>
                  (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0),
              )
              .slice(0, 100)
              .map((item) => (
                <tr key={item.id}>
                  <td>#{item.id.slice(0, 8)}</td>
                  <td>{item.createdAt?.toLocaleDateString("en-NG") || "—"}</td>
                  <td>{item.serviceName}</td>
                  <td>{item.status.replaceAll("_", " ")}</td>
                  <td>{item.quantity.toLocaleString("en-NG")}</td>
                  <td>{money(item.customerPriceMinor)}</td>
                  <td>{money(item.providerAccepted || Number.isInteger(item.providerOrderId) ? item.providerCostIncurredMinor ?? item.providerCostMinor : 0)}</td>
                  <td>{money(item.grossProfitMinor)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
