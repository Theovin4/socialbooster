import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/firebase/session";
import { ensureWallet } from "@/lib/firebase/wallet";
import { formatMoney } from "@/lib/money";
import { FundWallet } from "@/components/fund-wallet";

export const dynamic = "force-dynamic";
export default async function WalletPage() {
  const user = await requireUser();
  const ref = await ensureWallet(user.uid);
  const snapshot = await ref.get(), data = snapshot.data()!;
  const available = Number(data.availableMinor ?? data.balanceMinor ?? 0), reserved = Number(data.reservedMinor ?? 0), currency = String(data.currency || "NGN");
  return <AppShell><span className="eyebrow">Customer wallet</span><h1 style={{ fontSize: 42 }}>Wallet</h1><div className="grid3"><div className="glass card"><p className="muted">Available</p><strong style={{ fontSize: 32 }}>{formatMoney(BigInt(available), currency)}</strong></div><div className="glass card"><p className="muted">Reserved for orders</p><strong style={{ fontSize: 32 }}>{formatMoney(BigInt(reserved), currency)}</strong></div><div className="glass card"><p className="muted">Currency</p><strong style={{ fontSize: 32 }}>{currency}</strong></div></div><div className="glass card" style={{ marginTop: 20 }}><h2>Fund wallet</h2><p className="muted">Funding works only when sandbox payments are enabled. The wallet is credited after server-side verification, never from the return page.</p><FundWallet/><Link className="btn" href="/dashboard/transactions" style={{marginTop:16}}>View transaction history</Link></div></AppShell>;
}
