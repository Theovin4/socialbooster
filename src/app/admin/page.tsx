import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

const periods = { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days", "365": "Last 12 months", all: "All time" } as const;
type Period = keyof typeof periods;

async function customerGrowth(period: Period) {
  const customers: Date[] = [];
  let pageToken: string | undefined;
  do {
    const page = await adminAuth().listUsers(1000, pageToken);
    for (const user of page.users) if (user.customClaims?.admin !== true && user.metadata.creationTime) customers.push(new Date(user.metadata.creationTime));
    pageToken = page.pageToken;
  } while (pageToken);
  const now = Date.now(), day = 86_400_000;
  const countSince = (days: number) => customers.filter((created) => created.getTime() >= now - days * day).length;
  const selectedDays = period === "all" ? Math.max(1, Math.ceil((now - Math.min(now, ...customers.map((date) => date.getTime()))) / day)) : Number(period);
  const selectedCount = countSince(selectedDays);
  const previousCount = customers.filter((created) => created.getTime() >= now - selectedDays * 2 * day && created.getTime() < now - selectedDays * day).length;
  const growth = previousCount ? ((selectedCount - previousCount) / previousCount) * 100 : selectedCount ? 100 : 0;
  const bucketCount = period === "7" ? 7 : 8, bucketDays = selectedDays / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const start = new Date(now - (bucketCount - index) * bucketDays * day), end = new Date(now - (bucketCount - index - 1) * bucketDays * day);
    const label = period === "7" ? start.toLocaleDateString("en-NG", { weekday: "short" }) : start.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
    return { label, count: customers.filter((created) => created >= start && created < end).length };
  });
  return { total: customers.length, today: countSince(1), week: countSince(7), selectedCount, growth, buckets };
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireAdmin();
  const requestedPeriod = (await searchParams).period, period: Period = requestedPeriod && requestedPeriod in periods ? requestedPeriod as Period : "30";
  const db = adminDb();
  const [services, orders, wallets, transactions, customers] = await Promise.all([db.collection("services").where("active", "==", true).get(), db.collection("orders").limit(500).get(), db.collection("wallets").limit(500).get(), db.collection("walletTransactions").limit(500).get(), customerGrowth(period)]);
  const pending = orders.docs.filter((doc) => !["completed", "cancelled", "refunded", "failed"].includes(String(doc.get("status") || "").toLowerCase())).length;
  const depositsMinor = transactions.docs.filter((doc) => doc.get("type") === "deposit" && doc.get("currency") === "NGN").reduce((total, doc) => total + Number(doc.get("deltaMinor") || 0), 0);
  const walletMinor = wallets.docs.filter((doc) => String(doc.get("currency") || "NGN") === "NGN").reduce((total, doc) => total + Number(doc.get("availableMinor") ?? doc.get("balanceMinor") ?? 0), 0);
  const cards = [["Total customers", customers.total.toLocaleString("en-NG")], ["Joined today", customers.today.toLocaleString("en-NG")], ["Joined in 7 days", customers.week.toLocaleString("en-NG")], [`${periods[period]} growth`, `${customers.growth >= 0 ? "+" : ""}${customers.growth.toFixed(1)}%`], ["Active services", services.size.toLocaleString("en-NG")], ["Orders requiring attention", pending.toLocaleString("en-NG")], ["Customer wallet balance", formatMoney(BigInt(walletMinor), "NGN")], ["Verified deposits", formatMoney(BigInt(depositsMinor), "NGN")]];
  const maximum = Math.max(1, ...customers.buckets.map((bucket) => bucket.count));
  return <AppShell admin><span className="eyebrow">Protected operations</span><h1 className="page-heading">Administration overview</h1><p className="muted page-lead">Live customer growth, payments and operational totals. This area is protected by a server-verified administrator claim.</p><div className="grid3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>{cards.map(([label, value]) => <article className="glass card stat-card" key={label}><span className="muted">{label}</span><strong className="stat-value">{value}</strong></article>)}</div><section className="glass card" style={{ marginTop: 22 }}><div className="section-head"><div><span className="eyebrow">Customer growth</span><h2 style={{ marginBottom: 0 }}>New customer accounts</h2></div><form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><label className="sr-only" htmlFor="growth-period">Growth period</label><select className="field" id="growth-period" name="period" defaultValue={period}>{Object.entries(periods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="btn" type="submit">Apply filter</button></form></div><p className="muted">{customers.selectedCount.toLocaleString("en-NG")} customers joined during {periods[period].toLowerCase()}.</p><div style={{ display: "grid", gap: 12 }}>{customers.buckets.map((bucket) => <div key={bucket.label} style={{ display: "grid", gridTemplateColumns: "90px 1fr 48px", gap: 12, alignItems: "center" }}><span className="muted">{bucket.label}</span><div style={{ height: 10, borderRadius: 999, background: "var(--line)", overflow: "hidden" }}><div style={{ width: `${Math.max(bucket.count ? 4 : 0, bucket.count / maximum * 100)}%`, height: "100%", background: "linear-gradient(90deg,#28c7ef,#6667f4)" }} /></div><strong>{bucket.count}</strong></div>)}</div></section><div className="glass card" style={{ marginTop: 22 }}><div className="section-head"><div><span className="eyebrow">Operations</span><h2 style={{ marginBottom: 0 }}>Administrative controls</h2></div></div><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><Link className="btn primary" href="/admin/services">Manage services</Link><Link className="btn" href="/admin/transactions">Reconcile payment</Link><Link className="btn" href="/admin/wallets">Review wallets</Link></div></div></AppShell>;
}
