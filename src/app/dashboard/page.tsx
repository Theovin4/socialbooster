import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { ensureWallet } from "@/lib/firebase/wallet";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const walletRef = await ensureWallet(user.uid, "NGN");
  const wallet = await walletRef.get();
  const walletData = wallet.data() || {};
  const available = Number(walletData.availableMinor ?? walletData.balanceMinor ?? 0);
  const currency = String(walletData.currency || "NGN");
  const orders = await adminDb().collection("orders").where("userId", "==", user.uid).get();
  const active = orders.docs.filter((doc) => !["completed", "cancelled", "refunded", "failed"].includes(String(doc.get("status") || "").toLowerCase())).length;
  const completed = orders.docs.filter((doc) => String(doc.get("status") || "").toLowerCase() === "completed").length;
  const cards = [["Wallet balance", formatMoney(BigInt(available), currency)], ["Active orders", String(active)], ["Completed orders", String(completed)]];

  return <AppShell><span className="eyebrow">Account overview</span><h1 style={{ fontSize: 42 }}>Good to see you.</h1><div className="grid3">{cards.map(([label, value]) => <div className="glass card" key={label}><p className="muted">{label}</p><strong style={{ fontSize: 32 }}>{value}</strong></div>)}</div><div className="glass card" style={{ marginTop: 20 }}><h2>Quick actions</h2><p className="muted">Fund your naira wallet, place a new order, or review every wallet entry.</p><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><Link className="btn primary" href="/dashboard/wallet">Fund wallet</Link><Link className="btn" href="/dashboard/new-order">Create order</Link><Link className="btn" href="/dashboard/transactions">View transactions</Link></div></div></AppShell>;
}
