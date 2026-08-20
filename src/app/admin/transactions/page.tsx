import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { formatMoney } from "@/lib/money";
import { reconcileFlutterwave } from "./actions";

export const dynamic = "force-dynamic";
export default async function AdminTransactionsPage() {
  const snapshot = await adminDb().collection("walletTransactions").orderBy("createdAt", "desc").limit(100).get();
  return <AppShell admin><span className="eyebrow">Financial audit</span><h1 style={{ fontSize: 42 }}>Transactions</h1><div className="glass card" style={{ marginBottom: 22 }}><h2>Reconcile a successful Flutterwave payment</h2><p className="muted">Enter the numeric transaction ID from Flutterwave. The server verifies the payment, amount, currency and original reference before crediting. Repeating it cannot credit twice.</p><form action={reconcileFlutterwave} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><input className="field" name="transactionId" inputMode="numeric" pattern="[0-9]+" placeholder="Flutterwave transaction ID" required style={{ maxWidth: 360 }} /><button className="btn primary">Verify and credit</button></form></div>{snapshot.empty ? <div className="glass card"><h2>No wallet activity</h2><p className="muted">Verified deposits, debits, refunds and administrative adjustments will be listed here.</p></div> : <div style={{ display: "grid", gap: 12 }}>{snapshot.docs.map((doc) => { const item = doc.data(); return <article className="glass card" key={doc.id}><strong style={{ textTransform: "capitalize" }}>{String(item.type).replaceAll("_", " ")} · {formatMoney(BigInt(item.deltaMinor), item.currency)}</strong><p className="muted">User {item.userId} · Balance after {formatMoney(BigInt(item.balanceAfterMinor), item.currency)} · {item.reason || item.reference || doc.id}</p></article>; })}</div>}</AppShell>;
}
