import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/firebase/session";
import { ensureWallet } from "@/lib/firebase/wallet";
import { formatMoney } from "@/lib/money";
import { FundWallet } from "@/components/fund-wallet";

export const dynamic = "force-dynamic";

export default async function WalletPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const user = await requireUser();
  const { payment } = await searchParams;
  const ref = await ensureWallet(user.uid, "NGN");
  const snapshot = await ref.get(), data = snapshot.data()!;
  const available = Number(data.availableMinor ?? data.balanceMinor ?? 0), reserved = Number(data.reservedMinor ?? 0), currency = String(data.currency || "NGN");

  return <AppShell><span className="eyebrow">Customer wallet</span><h1 style={{ fontSize: 42 }}>Wallet</h1>{payment === "success" ? <div className="glass card" style={{ borderColor: "#34d399", marginBottom: 20 }}><strong>Payment verified and wallet credited.</strong><p className="muted" style={{ marginBottom: 0 }}>Your updated balance is shown below.</p></div> : null}{payment === "pending" ? <div className="glass card" style={{ borderColor: "#fbbf24", marginBottom: 20 }}><strong>Payment received; verification needs attention.</strong><p className="muted" style={{ marginBottom: 0 }}>Keep your Flutterwave transaction ID. An administrator can verify and credit it without charging you again.</p></div> : null}{payment === "cancelled" ? <div className="glass card" style={{ borderColor: "#f87171", marginBottom: 20 }}><strong>Payment was not completed.</strong><p className="muted" style={{ marginBottom: 0 }}>Your wallet was not charged by Social Booster.</p></div> : null}<div className="grid3"><div className="glass card"><p className="muted">Available</p><strong style={{ fontSize: 32 }}>{formatMoney(BigInt(available), currency)}</strong></div><div className="glass card"><p className="muted">Reserved for orders</p><strong style={{ fontSize: 32 }}>{formatMoney(BigInt(reserved), currency)}</strong></div><div className="glass card"><p className="muted">Currency</p><strong style={{ fontSize: 32 }}>{currency}</strong></div></div><div className="glass card" style={{ marginTop: 20 }}><h2>Fund wallet</h2><p className="muted">Pay securely in naira with Flutterwave. Your wallet is credited only after the server verifies the payment.</p><FundWallet/><Link className="btn" href="/dashboard/transactions" style={{ marginTop: 16 }}>View transaction history</Link></div></AppShell>;
}
