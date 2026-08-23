import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function Admin() {
  const db = adminDb();
  const [services, orders, wallets, transactions] = await Promise.all([db.collection("services").where("active", "==", true).get(), db.collection("orders").limit(500).get(), db.collection("wallets").limit(500).get(), db.collection("walletTransactions").limit(500).get()]);
  const pending = orders.docs.filter((doc) => !["completed", "cancelled", "refunded", "failed"].includes(String(doc.get("status") || "").toLowerCase())).length;
  const depositsMinor = transactions.docs.filter((doc) => doc.get("type") === "deposit" && doc.get("currency") === "NGN").reduce((total, doc) => total + Number(doc.get("deltaMinor") || 0), 0);
  const walletMinor = wallets.docs.filter((doc) => String(doc.get("currency") || "NGN") === "NGN").reduce((total, doc) => total + Number(doc.get("availableMinor") ?? doc.get("balanceMinor") ?? 0), 0);
  const cards = [["Active services", services.size.toLocaleString("en-NG")], ["Orders requiring attention", pending.toLocaleString("en-NG")], ["Customer wallet balance", formatMoney(BigInt(walletMinor), "NGN")], ["Verified deposits", formatMoney(BigInt(depositsMinor), "NGN")]];
  return <AppShell admin><span className="eyebrow">Protected operations</span><h1 className="page-heading">Administration overview</h1><p className="muted page-lead">Live operational totals from Firebase. This area is protected by a server-verified administrator claim.</p><div className="grid3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>{cards.map(([label, value]) => <article className="glass card stat-card" key={label}><span className="muted">{label}</span><strong className="stat-value">{value}</strong></article>)}</div><div className="glass card" style={{ marginTop: 22 }}><div className="section-head"><div><span className="eyebrow">Operations</span><h2 style={{ marginBottom: 0 }}>Administrative controls</h2></div></div><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><Link className="btn primary" href="/admin/services">Manage services</Link><Link className="btn" href="/admin/transactions">Reconcile payment</Link><Link className="btn" href="/admin/wallets">Review wallets</Link></div></div></AppShell>;
}
