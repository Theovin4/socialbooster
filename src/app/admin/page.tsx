import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

async function customerGrowth() {
  const customers: Date[] = [];
  let pageToken: string | undefined;
  do {
    const page = await adminAuth().listUsers(1000, pageToken);
    for (const user of page.users) if (user.customClaims?.admin !== true && user.metadata.creationTime) customers.push(new Date(user.metadata.creationTime));
    pageToken = page.pageToken;
  } while (pageToken);
  const now = Date.now(), day = 86_400_000;
  const countSince = (days: number) => customers.filter((created) => created.getTime() >= now - days * day).length;
  const current30 = countSince(30), previous30 = customers.filter((created) => created.getTime() >= now - 60 * day && created.getTime() < now - 30 * day).length;
  const growth = previous30 ? ((current30 - previous30) / previous30) * 100 : current30 ? 100 : 0;
  const monthly = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(); date.setDate(1); date.setHours(0, 0, 0, 0); date.setMonth(date.getMonth() - (5 - index));
    const end = new Date(date); end.setMonth(end.getMonth() + 1);
    return { label: date.toLocaleDateString("en-NG", { month: "short", year: "numeric" }), count: customers.filter((created) => created >= date && created < end).length };
  });
  return { total: customers.length, today: countSince(1), week: countSince(7), current30, growth, monthly };
}

export default async function Admin() {
  await requireAdmin();
  const db = adminDb();
  const [services, orders, wallets, transactions, customers] = await Promise.all([db.collection("services").where("active", "==", true).get(), db.collection("orders").limit(500).get(), db.collection("wallets").limit(500).get(), db.collection("walletTransactions").limit(500).get(), customerGrowth()]);
  const pending = orders.docs.filter((doc) => !["completed", "cancelled", "refunded", "failed"].includes(String(doc.get("status") || "").toLowerCase())).length;
  const depositsMinor = transactions.docs.filter((doc) => doc.get("type") === "deposit" && doc.get("currency") === "NGN").reduce((total, doc) => total + Number(doc.get("deltaMinor") || 0), 0);
  const walletMinor = wallets.docs.filter((doc) => String(doc.get("currency") || "NGN") === "NGN").reduce((total, doc) => total + Number(doc.get("availableMinor") ?? doc.get("balanceMinor") ?? 0), 0);
  const cards = [["Total customers", customers.total.toLocaleString("en-NG")], ["Joined today", customers.today.toLocaleString("en-NG")], ["Joined in 7 days", customers.week.toLocaleString("en-NG")], ["30-day growth", `${customers.growth >= 0 ? "+" : ""}${customers.growth.toFixed(1)}%`], ["Active services", services.size.toLocaleString("en-NG")], ["Orders requiring attention", pending.toLocaleString("en-NG")], ["Customer wallet balance", formatMoney(BigInt(walletMinor), "NGN")], ["Verified deposits", formatMoney(BigInt(depositsMinor), "NGN")]];
  const maximum = Math.max(1, ...customers.monthly.map((month) => month.count));
  return <AppShell admin><span className="eyebrow">Protected operations</span><h1 className="page-heading">Administration overview</h1><p className="muted page-lead">Live customer growth, payments and operational totals. This area is protected by a server-verified administrator claim.</p><div className="grid3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>{cards.map(([label, value]) => <article className="glass card stat-card" key={label}><span className="muted">{label}</span><strong className="stat-value">{value}</strong></article>)}</div><section className="glass card" style={{ marginTop: 22 }}><div className="section-head"><div><span className="eyebrow">Customer growth</span><h2 style={{ marginBottom: 0 }}>New accounts by month</h2></div><strong>{customers.current30.toLocaleString("en-NG")} in 30 days</strong></div><div style={{ display: "grid", gap: 12 }}>{customers.monthly.map((month) => <div key={month.label} style={{ display: "grid", gridTemplateColumns: "90px 1fr 48px", gap: 12, alignItems: "center" }}><span className="muted">{month.label}</span><div style={{ height: 10, borderRadius: 999, background: "var(--line)", overflow: "hidden" }}><div style={{ width: `${Math.max(month.count ? 4 : 0, month.count / maximum * 100)}%`, height: "100%", background: "linear-gradient(90deg,#28c7ef,#6667f4)" }} /></div><strong>{month.count}</strong></div>)}</div></section><div className="glass card" style={{ marginTop: 22 }}><div className="section-head"><div><span className="eyebrow">Operations</span><h2 style={{ marginBottom: 0 }}>Administrative controls</h2></div></div><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><Link className="btn primary" href="/admin/services">Manage services</Link><Link className="btn" href="/admin/transactions">Reconcile payment</Link><Link className="btn" href="/admin/wallets">Review wallets</Link></div></div></AppShell>;
}
