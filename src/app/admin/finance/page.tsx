import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/firebase/session";
import { financeSummary } from "@/lib/finance";
import { loadFinanceData } from "@/lib/finance-data";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
const statuses = [
  "all",
  "pending",
  "processing",
  "in_progress",
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
  }>;
}) {
  await requireAdmin();
  const filters = await searchParams,
    range = filters.range || "30d",
    status = filters.status || "all";
  const data = await loadFinanceData({ ...filters, range, status });
  const summary = financeSummary(
    data.orders,
    data.transactions,
    data.walletLiabilityMinor,
  );
  const byDay = new Map<string, number>();
  for (const order of data.orders) {
    if (!order.createdAt) continue;
    const key = order.createdAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) || 0) + order.customerPriceMinor);
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
    current.cost += order.providerCostMinor;
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
  const cards = [
    [
      "Customer deposits",
      summary.depositsMinor,
      "Cash funded into customer wallets",
    ],
    ["Order value", summary.orderValueMinor, "Customer charges before refunds"],
    ["Net sales", summary.netSalesMinor, "Order value less customer refunds"],
    [
      "Capital deployed",
      summary.capitalDeployedMinor,
      "Recorded cost of accepted orders",
    ],
    [
      "Gross profit",
      summary.grossProfitMinor,
      "Net sales less deployed capital",
    ],
    [
      "Wallet liability",
      summary.walletLiabilityMinor,
      "Unused customer balances",
    ],
  ] as const;
  return (
    <AppShell admin>
      <div className="section-head">
        <div>
          <span className="eyebrow">Financial intelligence</span>
          <h1 className="page-heading">Finance</h1>
          <p className="muted page-lead">
            Auditable sales, cost, profit, cash and customer-liability metrics
            from Firebase.
          </p>
        </div>
        <a
          className="btn primary"
          href={`/api/admin/finance/export?${exportQuery}`}
        >
          Download Excel workbook
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
      <div className="finance-kpis">
        {cards.map(([label, value, note]) => (
          <article className="glass card stat-card" key={label}>
            <span className="muted">{label}</span>
            <strong className="stat-value finance-value">{money(value)}</strong>
            <small className="muted">{note}</small>
          </article>
        ))}
      </div>
      <div className="finance-kpis compact">
        <article className="glass card">
          <span className="muted">Gross margin</span>
          <strong>{(summary.grossMarginBps / 100).toFixed(1)}%</strong>
        </article>
        <article className="glass card">
          <span className="muted">Refunds</span>
          <strong>{money(summary.refundsMinor)}</strong>
        </article>
        <article className="glass card">
          <span className="muted">Active capital</span>
          <strong>{money(summary.activeCapitalMinor)}</strong>
        </article>
        <article className="glass card">
          <span className="muted">Orders</span>
          <strong>{summary.orderCount.toLocaleString("en-NG")}</strong>
        </article>
        <article className="glass card">
          <span className="muted">Completed</span>
          <strong>{summary.completedOrders.toLocaleString("en-NG")}</strong>
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
            <p className="muted">No order activity in this period.</p>
          )}
        </section>
        <section className="glass card">
          <span className="eyebrow">Sales mix</span>
          <h2>Top categories</h2>
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
            <p className="muted">No category activity in this period.</p>
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
              <th>Capital cost</th>
              <th>Recorded profit</th>
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
                  <td>{money(item.providerCostMinor)}</td>
                  <td>{money(item.grossProfitMinor)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
