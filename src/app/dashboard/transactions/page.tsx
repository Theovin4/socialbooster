import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
function date(value: unknown) { return value && typeof value === "object" && "toDate" in value ? (value as { toDate(): Date }).toDate().toLocaleString() : "Pending"; }
export default async function TransactionsPage() {
  const user = await requireUser();
  const snapshot = await adminDb().collection("walletTransactions").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(100).get();
  return <AppShell><span className="eyebrow">Wallet ledger</span><h1 style={{ fontSize: 42 }}>Transactions</h1>{snapshot.empty ? <div className="glass card"><h2>No transactions yet</h2><p className="muted">Verified deposits, order debits, refunds and approved adjustments will appear here.</p></div> : <div style={{ display: "grid", gap: 12 }}>{snapshot.docs.map((doc) => { const item = doc.data(); return <article className="glass card" key={doc.id} style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}><div><strong style={{ textTransform: "capitalize" }}>{String(item.type).replaceAll("_", " ")}</strong><p className="muted" style={{ marginBottom: 0 }}>{item.reason || item.reference || doc.id} · {date(item.createdAt)}</p></div><strong style={{ color: item.deltaMinor >= 0 ? "#6ee7b7" : "#fca5a5", fontSize: 22 }}>{item.deltaMinor >= 0 ? "+" : ""}{formatMoney(BigInt(item.deltaMinor), item.currency)}</strong></article>; })}</div>}</AppShell>;
}
