import Link from "next/link";
import { ArrowUpRight, ClipboardList, PlusCircle, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Toast } from "@/components/toast";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { ensureWallet } from "@/lib/firebase/wallet";
import { formatMoney } from "@/lib/money";
import { reconcilePendingFlutterwavePayments } from "@/lib/payments/credit";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requireUser();
  const { notice } = await searchParams;
  const [account] = await Promise.all([adminAuth().getUser(user.uid), reconcilePendingFlutterwavePayments(user.uid)]);
  const firstName = account.displayName?.trim().split(/\s+/)[0] || user.name?.trim().split(/\s+/)[0] || "there";
  const walletRef = await ensureWallet(user.uid, "NGN");
  const [wallet, orderSnapshot] = await Promise.all([walletRef.get(), adminDb().collection("orders").where("userId", "==", user.uid).limit(250).get()]);
  const walletData = wallet.data() || {};
  const available = Number(walletData.availableMinor ?? walletData.balanceMinor ?? 0);
  const currency = String(walletData.currency || "NGN");
  const sorted = orderSnapshot.docs.sort((a, b) => (b.get("createdAt")?.toMillis?.() || 0) - (a.get("createdAt")?.toMillis?.() || 0));
  const active = sorted.filter((doc) => !["completed", "cancelled", "refunded", "failed"].includes(String(doc.get("status") || "").toLowerCase())).length;
  const completed = sorted.filter((doc) => String(doc.get("status") || "").toLowerCase() === "completed").length;
  const cards = [["Available balance", formatMoney(BigInt(available), currency), WalletCards], ["Active orders", String(active), ClipboardList], ["Completed orders", String(completed), ArrowUpRight]] as const;

  return <AppShell>
    {notice === "welcome" ? <Toast kind="success" title={`Welcome, ${firstName}`} message="Signed in successfully." /> : null}
    <h1 className="page-heading">Welcome back, {firstName}.</h1>
    <div className="grid3">{cards.map(([label, value, Icon]) => <article className="glass card stat-card" key={label}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span className="muted">{label}</span><Icon size={20} color="#63d9ff" /></div><strong className="stat-value">{value}</strong></article>)}</div>
    <div className="form-grid" style={{ marginTop: 22 }}>
      <section className="glass card"><div className="section-head"><h2>Latest orders</h2><Link className="btn" href="/dashboard/orders">View all</Link></div>{sorted.length === 0 ? <div className="notice"><strong>No orders yet.</strong><p className="muted" style={{ marginBottom: 0 }}>Fund your wallet, then choose a service.</p></div> : sorted.slice(0, 5).map((doc) => <Link href={`/dashboard/orders/${doc.id}`} key={doc.id} style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "14px 0", borderBottom: "1px solid var(--line)" }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.get("serviceName")}</span><span className="status-pill">{String(doc.get("status") || "pending").replaceAll("_", " ")}</span></Link>)}</section>
      <section className="glass card"><h2>Quick actions</h2><div style={{ display: "grid", gap: 10 }}><Link className="btn primary" href="/dashboard/new-order"><PlusCircle size={18} /> New order</Link><Link className="btn" href="/dashboard/wallet"><WalletCards size={18} /> Fund wallet</Link><Link className="btn" href="/services"><ClipboardList size={18} /> Browse services</Link></div></section>
    </div>
  </AppShell>;
}
