import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/firebase/session";
import { ensureWallet } from "@/lib/firebase/wallet";
import { adminDb } from "@/lib/firebase/admin";
import { formatMoney } from "@/lib/money";
import { FundWallet } from "@/components/fund-wallet";
import { reconcilePendingFlutterwavePayments } from "@/lib/payments/credit";

export const dynamic = "force-dynamic";
export default async function WalletPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const user = await requireUser(), { payment } = await searchParams;
  await reconcilePendingFlutterwavePayments(user.uid);
  const ref = await ensureWallet(user.uid, "NGN"), snapshot = await ref.get(), data = snapshot.data()!;
  const available = Number(data.availableMinor ?? data.balanceMinor ?? 0), reserved = Number(data.reservedMinor ?? 0), currency = String(data.currency || "NGN");
  const transactionSnapshot = await adminDb().collection("walletTransactions").where("userId", "==", user.uid).limit(100).get();
  const recent = transactionSnapshot.docs.sort((a, b) => (b.get("createdAt")?.toMillis?.() || 0) - (a.get("createdAt")?.toMillis?.() || 0)).slice(0, 5);
  return <AppShell><span className="eyebrow">Payments and balance</span><h1 className="page-heading">Fund your wallet</h1><p className="muted page-lead">Secure NGN payments are verified with Flutterwave before appearing in your immutable wallet history.</p>{payment === "success" ? <div className="notice" style={{ borderColor: "#34d399", marginBottom: 20 }}><strong>Payment verified and wallet credited.</strong></div> : null}{payment === "pending" ? <div className="notice" style={{ borderColor: "#fbbf24", marginBottom: 20 }}><strong>Payment received; verification needs attention.</strong><br />Keep your Flutterwave transaction ID for reconciliation.</div> : null}<div className="grid3"><article className="glass card stat-card"><span className="muted">Available balance</span><strong className="stat-value">{formatMoney(BigInt(available), currency)}</strong></article><article className="glass card stat-card"><span className="muted">Reserved for orders</span><strong className="stat-value">{formatMoney(BigInt(reserved), currency)}</strong></article><article className="glass card stat-card"><span className="muted">Wallet currency</span><strong className="stat-value">{currency}</strong></article></div><div className="form-grid" style={{ marginTop: 22 }}><section className="glass card"><span className="eyebrow">Flutterwave</span><h2>Add funds securely</h2><div className="notice" style={{ marginBottom: 20 }}>Enter the exact amount you want to add. Complete payment only on Flutterwave’s secure checkout. Credits normally appear immediately after verification.</div><FundWallet /></section><section className="glass card"><div className="section-head"><div><span className="eyebrow">Ledger</span><h2>Recent activity</h2></div><Link className="btn" href="/dashboard/transactions">View all</Link></div>{recent.length === 0 ? <p className="muted">No wallet activity yet.</p> : recent.map((doc) => { const item = doc.data(), amount = Number(item.deltaMinor || 0); return <div key={doc.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "13px 0", borderBottom: "1px solid var(--line)" }}><span style={{ textTransform: "capitalize" }}>{String(item.type).replaceAll("_", " ")}</span><strong style={{ color: amount >= 0 ? "#6ee7b7" : "#fca5a5" }}>{amount >= 0 ? "+" : ""}{formatMoney(BigInt(amount), String(item.currency || "NGN"))}</strong></div>; })}</section></div></AppShell>;
}
