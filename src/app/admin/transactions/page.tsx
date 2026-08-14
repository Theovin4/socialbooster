import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
export default async function AdminTransactionsPage() {
  const snapshot = await adminDb().collection("walletTransactions").orderBy("createdAt", "desc").limit(100).get();
  return <AppShell admin><span className="eyebrow">Financial audit</span><h1 style={{ fontSize: 42 }}>Transactions</h1>{snapshot.empty ? <div className="glass card"><h2>No wallet activity</h2><p className="muted">Verified deposits, debits, refunds and administrative adjustments will be listed here.</p></div> : <div style={{ display: "grid", gap: 12 }}>{snapshot.docs.map((doc) => { const item = doc.data(); return <article className="glass card" key={doc.id}><strong style={{ textTransform: "capitalize" }}>{String(item.type).replaceAll("_", " ")} · {formatMoney(BigInt(item.deltaMinor), item.currency)}</strong><p className="muted">User {item.userId} · Balance after {formatMoney(BigInt(item.balanceAfterMinor), item.currency)} · {item.reason || item.reference || doc.id}</p></article>; })}</div>}</AppShell>;
}
