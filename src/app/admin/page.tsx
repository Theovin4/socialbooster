import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Toast } from "@/components/toast";
import { adminDb } from "@/lib/firebase/admin";
import { getOperationalTotals, lagosDateKey, type OperationalTotals } from "@/lib/firebase/stats";
import { requireAdmin } from "@/lib/firebase/session";
import { formatMoney } from "@/lib/money";
import { sendActivationRecovery } from "./actions";
import { loadCustomerGrowthDays } from "@/lib/firebase/analytics-rollups";
import { FINANCE_ROLLUP_VERSION } from "@/lib/finance-rollup-model";
import { metricRegistry } from "@/lib/analytics-quality";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const periods = { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days", "365": "Last 12 months", all: "All time" } as const;
type Period = keyof typeof periods;
type Growth = { total: number; today: number; week: number; selectedCount: number; growth: number | null; buckets: { label: string; count: number }[] };

const DAY = 86_400_000;
function dateFromKey(key: string) { return new Date(`${key}T12:00:00+01:00`); }
function keyForOffset(today: Date, offset: number) { return lagosDateKey(new Date(today.getTime() - offset * DAY)); }
function totalBetween(daily: Record<string, number>, start: string, end: string) {
  return Object.entries(daily).reduce((total, [key, count]) => total + (key >= start && key <= end ? count : 0), 0);
}

function customerGrowth(totals: OperationalTotals, period: Period): Growth {
  const daily = totals.dailyCustomerJoins;
  const todayKey = totals.todayKey;
  const today = dateFromKey(todayKey);
  const trackedKeys = Object.keys(daily).sort();
  const selectedDays = period === "all"
    ? Math.max(1, trackedKeys.length ? Math.round((today.getTime() - dateFromKey(trackedKeys[0]).getTime()) / DAY) + 1 : 1)
    : Number(period);
  const startKey = keyForOffset(today, selectedDays - 1);
  const previousStartKey = keyForOffset(today, selectedDays * 2 - 1);
  const previousEndKey = keyForOffset(today, selectedDays);
  const selectedCount = period === "all" ? totals.totalCustomers : totalBetween(daily, startKey, todayKey);
  const previousCount = totalBetween(daily, previousStartKey, previousEndKey);
  const growth = period === "all" || previousCount === 0 ? null : ((selectedCount - previousCount) / previousCount) * 100;
  const bucketCount = period === "7" ? 7 : Math.min(8, selectedDays);
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const newestOffset = Math.floor((bucketCount - index - 1) * selectedDays / bucketCount);
    const oldestOffset = Math.max(newestOffset, Math.floor((bucketCount - index) * selectedDays / bucketCount) - 1);
    const bucketStart = keyForOffset(today, oldestOffset);
    const bucketEnd = keyForOffset(today, newestOffset);
    const labelDate = dateFromKey(bucketStart);
    return {
      label: period === "7" ? labelDate.toLocaleDateString("en-NG", { weekday: "short", timeZone: "Africa/Lagos" }) : labelDate.toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }),
      count: totalBetween(daily, bucketStart, bucketEnd),
    };
  });
  return { total: totals.totalCustomers, today: totals.joinedToday, week: totalBetween(daily, keyForOffset(today, 6), todayKey), selectedCount, growth, buckets };
}

async function aggregateDashboardMetrics() {
  const db = adminDb();
  const [documents, attention] = await Promise.all([
    db.getAll(
      db.collection("analytics").doc("global"),
      db.collection("publicCatalogStats").doc("current"),
    ),
    db.collection("orders").where("status", "in", ["provider_confirmation_required", "cancel_requested"]).count().get(),
  ]);
  const [analytics, catalogue] = documents;
  const financeTrusted = analytics.get("financeRollupVersion") === FINANCE_ROLLUP_VERSION && analytics.get("historicalBackfillComplete") === true;
  const financeValue = (field: string) => {
    const value = Number(analytics.get(field));
    return financeTrusted && Number.isFinite(value) ? value : null;
  };
  const catalogCount = Number(catalogue.get("publicEligibleCount"));
  return {
    activeServices: catalogue.exists && Number.isSafeInteger(catalogCount) && catalogCount >= 0 ? catalogCount : null,
    catalogUpdatedAt: catalogue.get("updatedAt")?.toDate?.() || null,
    attention: Number(attention.data().count),
    activeOrders: financeValue("activeOrders"),
    walletMinor: financeValue("walletLiabilityMinor"),
    depositsMinor: financeValue("depositsMinor"),
    financeUpdatedAt: financeTrusted ? analytics.get("lastReconciledAt")?.toDate?.() || null : null,
    failed: [financeTrusted ? null : "finance rollup", catalogue.exists ? null : "public catalogue total"].filter((item): item is string => Boolean(item)),
  };
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ period?: string; activation?: string; sent?: string; skipped?: string; failed?: string }> }) {
  await requireAdmin();
  const params = await searchParams, requestedPeriod = params.period, period: Period = requestedPeriod && requestedPeriod in periods ? requestedPeriod as Period : "30";
  let dataAvailable = true;
  const results = await Promise.allSettled([getOperationalTotals(), aggregateDashboardMetrics()] as const);
  for (const [index, result] of results.entries()) if (result.status === "rejected") {
    dataAvailable = false;
    console.error("[admin-dashboard] metric unavailable", { metric: index === 0 ? "totals" : "aggregates", error: result.reason instanceof Error ? result.reason.message : "Unknown error" });
  }
  const totals = results[0].status === "fulfilled" ? results[0].value : null;
  const metrics = results[1].status === "fulfilled" ? results[1].value : null;
  if (metrics?.failed.length) dataAvailable = false;
  let customers: Growth | null = null;
  if (totals) {
    const today = dateFromKey(totals.todayKey), days = period === "all" ? null : Number(period);
    const daily = await loadCustomerGrowthDays(days === null ? keyForOffset(today, 364) : keyForOffset(today, days * 2 - 1), totals.todayKey).catch(() => ({}));
    customers = customerGrowth({ ...totals, dailyCustomerJoins: { ...totals.dailyCustomerJoins, ...daily } }, period);
  }
  const unavailable = "Unavailable";
  const cards = [
    ["Total customers", customers?.total.toLocaleString("en-NG") ?? unavailable, metricRegistry.totalCustomers.definition],
    ["Joined today", customers?.today.toLocaleString("en-NG") ?? unavailable, "Customer accounts created during the current Africa/Lagos calendar day."],
    ["Joined in 7 days", customers?.week.toLocaleString("en-NG") ?? unavailable, "Customer accounts created today and the previous six Africa/Lagos calendar days."],
    ["Total orders", totals?.totalOrders.toLocaleString("en-NG") ?? unavailable, metricRegistry.totalOrders.definition],
    [`${periods[period]} growth`, customers ? customers.growth === null ? "N/A" : `${customers.growth >= 0 ? "+" : ""}${customers.growth.toFixed(1)}%` : unavailable, period === "all" ? "An equal preceding all-time period is not meaningful." : "Compared with the immediately preceding period of equal length."],
    ["Active services", metrics?.activeServices?.toLocaleString("en-NG") ?? unavailable, metricRegistry.activeServices.definition],
    ["Orders requiring attention", metrics?.attention?.toLocaleString("en-NG") ?? unavailable, metricRegistry.ordersRequiringAttention.definition],
    ["Active provider orders", metrics?.activeOrders !== null && metrics?.activeOrders !== undefined ? metrics.activeOrders.toLocaleString("en-NG") : unavailable, "Non-terminal orders still tied to provider delivery or confirmation."],
    ["Current NGN wallet liability", metrics?.walletMinor !== null && metrics?.walletMinor !== undefined ? formatMoney(BigInt(metrics.walletMinor), "NGN") : unavailable, metricRegistry.walletLiability.definition],
    ["Verified customer deposits", metrics?.depositsMinor !== null && metrics?.depositsMinor !== undefined ? formatMoney(BigInt(metrics.depositsMinor), "NGN") : unavailable, metricRegistry.verifiedDeposits.definition],
  ];
  const maximum = Math.max(1, ...(customers?.buckets || []).map((bucket) => bucket.count));
  return <AppShell admin>
    {params.activation === "complete" ? <Toast kind="success" title="Activation recovery completed" message={`${params.sent || "0"} sent, ${params.skipped || "0"} already handled and ${params.failed || "0"} failed.`} /> : params.activation === "failed" ? <Toast kind="error" title="Activation recovery could not complete" message="No account access was changed. Review the email configuration and try again." /> : null}
    {!dataAvailable ? <div className="notice" style={{ marginBottom: 22 }}><strong>Some live totals are temporarily unavailable.</strong><p className="muted" style={{ marginBottom: 0 }}>Available metrics remain visible below. Refresh in a few minutes; no account or payment data has been changed.</p></div> : null}
    <span className="eyebrow">Protected operations</span><h1 className="page-heading">Administration overview</h1><p className="muted page-lead">Live customer growth, payments and operational totals. This area is protected by a server-verified administrator claim.</p>
    <div className="grid3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>{cards.map(([label, value, definition]) => <article className="glass card stat-card" key={label} title={definition}><span className="muted">{label}</span><strong className="stat-value">{value}</strong></article>)}</div>
    <p className="muted" style={{ marginTop: 10 }}>Catalogue total as of {metrics?.catalogUpdatedAt?.toLocaleString("en-NG", { timeZone: "Africa/Lagos" }) || "unavailable"}. Finance totals last reconciled {metrics?.financeUpdatedAt?.toLocaleString("en-NG", { timeZone: "Africa/Lagos" }) || "not yet"}.</p>
    <section className="glass card" style={{ marginTop: 22 }}><div className="section-head"><div><span className="eyebrow">Customer growth</span><h2 style={{ marginBottom: 0 }}>New customer accounts</h2></div><form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><label className="sr-only" htmlFor="growth-period">Growth period</label><select className="field" id="growth-period" name="period" defaultValue={period}>{Object.entries(periods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="btn" type="submit">Apply filter</button></form></div><p className="muted">{customers ? `${customers.selectedCount.toLocaleString("en-NG")} customers joined during ${periods[period].toLowerCase()}.${period === "all" ? " The chart shows the most recent 12 months; an equal prior all-time comparison is not applicable." : ""}` : "Growth data is temporarily unavailable."}</p><div style={{ display: "grid", gap: 12 }}>{customers?.buckets.map((bucket) => <div key={bucket.label} style={{ display: "grid", gridTemplateColumns: "90px 1fr 48px", gap: 12, alignItems: "center" }}><span className="muted">{bucket.label}</span><div style={{ height: 10, borderRadius: 999, background: "var(--line)", overflow: "hidden" }}><div style={{ width: `${Math.max(bucket.count ? 4 : 0, bucket.count / maximum * 100)}%`, height: "100%", background: "linear-gradient(90deg,#28c7ef,#6667f4)" }} /></div><strong>{bucket.count}</strong></div>)}</div></section>
    <div className="glass card" style={{ marginTop: 22 }}><div className="section-head"><div><span className="eyebrow">Operations</span><h2 style={{ marginBottom: 0 }}>Administrative controls</h2></div></div><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><Link className="btn primary" href="/admin/services">Manage services</Link><Link className="btn" href="/admin/provider">Provider recovery queue</Link><Link className="btn" href="/admin/transactions">Reconcile payment</Link><Link className="btn" href="/admin/wallets">Review wallets</Link><Link className="btn" href="/admin/operations">Review Firebase cost</Link><Link className="btn" href="/admin/seo">Review search health</Link><form action={sendActivationRecovery}><button className="btn" type="submit">Send recent activation emails</button></form></div></div>
  </AppShell>;
}
