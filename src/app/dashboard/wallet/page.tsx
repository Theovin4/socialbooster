import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Toast } from "@/components/toast";
import { FundWallet } from "@/components/fund-wallet";
import { requireUser } from "@/lib/firebase/session";
import { ensureWallet } from "@/lib/firebase/wallet";
import { adminDb } from "@/lib/firebase/admin";
import { formatMoney } from "@/lib/money";
import { reconcilePendingFlutterwavePayments } from "@/lib/payments/credit";

export const dynamic = "force-dynamic";
export default async function WalletPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const user = await requireUser();
  const { payment } = await searchParams;
  await reconcilePendingFlutterwavePayments(user.uid);
  const ref = await ensureWallet(user.uid, "NGN");
  const snapshot = await ref.get();
  const data = snapshot.data()!;
  const available = Number(data.availableMinor ?? data.balanceMinor ?? 0);
  const reserved = Number(data.reservedMinor ?? 0);
  const currency = String(data.currency || "NGN");
  const transactionSnapshot = await adminDb().collection("walletTransactions").where("userId", "==", user.uid).limit(100).get();
  const recent = transactionSnapshot.docs.sort((a, b) => (b.get("createdAt")?.toMillis?.() || 0) - (a.get("createdAt")?.toMillis?.() || 0)).slice(0, 5);
  return <AppShell>{payment === "success" ? <Toast type="success" title="Payment successful" message="Your payment was verified and your wallet has been credited." /> : null}{payment === "pending" ? <Toast type="info" title="Verification in progress" message="We received your payment response and are confirming it. Keep your transaction reference." /> : null}{payment === "cancelled" ? <Toast type="error" title="Payment not completed" message="Your wallet was not charged. You can try again when ready." /> : null}<span className="eyebrow">Payments and balance</span><h1 className="page-heading">Fund your wallet</h1><p className="muted page-lead">Secure naira payments are confirmed before funds are added to your wallet history.</p><div className="grid3"><article className="glass card stat-card"><span className="muted">Available balance</span><strong className="stat-value">{formatMoney(BigInt(available), currency)}</strong></article><article className="glass card stat-card"><span className="muted">Reserved for orders</span><strong className="stat-value">{formatMoney(BigInt(reserved), currency)}</strong></article><article className="glass card stat-card"><span className="muted">Wallet currency</span><strong className="stat-value">{currency}</strong></article></div><div className="form-grid" style={{ marginTop: 22 }}><section className="glass card"><span className="eyebrow">Secure checkout</span><h2>Add funds</h2><div className="notice" style={{ marginBottom: 20 }}>Enter the exact amount you want to add. Complete payment only on Flutterwave&apos;s secure checkout. Funds normally appear immediately after verification.</div><FundWallet /></section><section className="glass card"><div className="section-head"><div><span className="eyebrow">Wallet</span><h2>Recent activity</h2></div><Link className="btn" href="/dashboard/transactions">View all</Link></div>{recent.length === 0 ? <p className="muted">No wallet activity yet. Your successful payments and order charges will appear here.</p> : recent.map((doc) => { const item = doc.data(); const amount = Number(item.deltaMinor || 0); return <div key={doc.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "13px 0", borderBottom: "1px solid var(--line)" }}><span style={{ textTransform: "capitalize" }}>{String(item.type).replaceAll("_", " ")}</span><strong style={{ color: amount >= 0 ? "#6ee7b7" : "#fca5a5" }}>{amount >= 0 ? "+" : ""}{formatMoney(BigInt(amount), String(item.currency || "NGN"))}</strong></div>; })}</section></div></AppShell>;
}
