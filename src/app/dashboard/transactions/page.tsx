import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

function date(value: unknown) {
  const timestamp = value as { toDate?: () => Date } | null;
  return timestamp?.toDate?.().toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }) || "Processing";
}

export default async function Transactions() {
  const user = await requireUser();
  const snapshot = await adminDb().collection("walletTransactions").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(25).get();
  const transactions = snapshot.docs;

  return <AppShell><span className="eyebrow">Wallet ledger</span><h1 style={{ fontSize: 42 }}>Transactions</h1>{transactions.length === 25 ? <p className="muted">Showing your 25 most recent wallet entries.</p> : null}{transactions.length === 0 ? <div className="glass card"><h2>No transactions yet</h2><p className="muted">Verified deposits, order debits, refunds and approved adjustments will appear here.</p></div> : <div style={{ display: "grid", gap: 12 }}>{transactions.map((doc) => { const item = doc.data(), delta = Number(item.deltaMinor || 0); return <article className="glass card" key={doc.id} style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}><div><strong style={{ textTransform: "capitalize" }}>{String(item.type).replaceAll("_", " ")}</strong><p className="muted" style={{ marginBottom: 0 }}>{item.reason || item.reference || doc.id} · {date(item.createdAt)}</p></div><strong style={{ color: delta >= 0 ? "#6ee7b7" : "#fca5a5", fontSize: 22 }}>{delta >= 0 ? "+" : ""}{formatMoney(BigInt(delta), String(item.currency || "NGN"))}</strong></article>; })}</div>}</AppShell>;
}
