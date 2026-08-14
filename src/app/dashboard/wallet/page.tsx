import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/firebase/session";
import { ensureWallet } from "@/lib/firebase/wallet";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
export default async function WalletPage() {
  const user = await requireUser();
  const ref = await ensureWallet(user.uid);
  const snapshot = await ref.get(), data = snapshot.data()!;
  const available = Number(data.availableMinor ?? data.balanceMinor ?? 0), reserved = Number(data.reservedMinor ?? 0), currency = String(data.currency || "USD");
  return <AppShell><span className="eyebrow">Customer wallet</span><h1 style={{ fontSize: 42 }}>Wallet</h1><div className="grid3"><div className="glass card"><p className="muted">Available</p><strong style={{ fontSize: 32 }}>{formatMoney(BigInt(available), currency)}</strong></div><div className="glass card"><p className="muted">Reserved for orders</p><strong style={{ fontSize: 32 }}>{formatMoney(BigInt(reserved), currency)}</strong></div><div className="glass card"><p className="muted">Currency</p><strong style={{ fontSize: 32 }}>{currency}</strong></div></div><div className="glass card" style={{ marginTop: 20 }}><h2>Funding is not live yet</h2><p className="muted">Your wallet is active, but real deposits remain disabled until verified payment integrations pass sandbox testing. Never send money based on instructions outside this dashboard.</p><Link className="btn" href="/dashboard/transactions">View transaction history</Link></div></AppShell>;
}
