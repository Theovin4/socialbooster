import Link from "next/link";
import { ArrowUpRight, ClipboardList, PlusCircle, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { ensureWallet } from "@/lib/firebase/wallet";
import { formatMoney } from "@/lib/money";
import { reconcilePendingFlutterwavePayments } from "@/lib/payments/credit";
import { adminAuth } from "@/lib/firebase/admin";
import { Toast } from "@/components/toast";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requireUser(), db = adminDb();
  const { notice } = await searchParams;
  const account = await adminAuth().getUser(user.uid);
  const firstName = account.displayName?.trim().split(/\s+/)[0] || user.name?.trim().split(/\s+/)[0] || "there";
  await reconcilePendingFlutterwavePayments(user.uid);
  const walletRef = await ensureWallet(user.uid, "NGN"), wallet = await walletRef.get(), walletData = wallet.data() || {};
  const available = Number(walletData.availableMinor ?? walletData.balanceMinor ?? 0), currency = String(walletData.currency || "NGN");
  const orderSnapshot = await db.collection("orders").where("userId", "==", user.uid).limit(250).get();
  const sorted = orderSnapshot.docs.sort((a, b) => (b.get("createdAt")?.toMillis?.() || 0) - (a.get("createdAt")?.toMillis?.() || 0));
  const active = sorted.filter((doc) => !["completed", "cancelled", "refunded", "failed"].includes(String(doc.get("status") || "").toLowerCase())).length, completed = sorted.filter((doc) => String(doc.get("status") || "").toLowerCase() === "completed").length;
  const cards = [["Available balance", formatMoney(BigInt(available), currency), WalletCards], ["Active orders", String(active), ClipboardList], ["Completed orders", String(completed), ArrowUpRight]] as const;
  return <AppShell>{notice === "welcome" ? <Toast kind="success" title={`Welcome, ${firstName}`} message="You are signed in. Your account overview is ready." /> : null}<span className="eyebrow">Customer overview</span><h1 className="page-heading">Welcome back, {firstName}.</h1><p className="muted page-lead">Here is the latest activity across your wallet and orders.</p><div className="grid3">{cards.map(([label, value, Icon]) => <article className="glass card stat-card" key={label}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span className="muted">{label}</span><Icon size={20} color="#63d9ff" /></div><strong className="stat-value">{value}</strong></article>)}</div><div className="form-grid" style={{ marginTop: 22 }}><section className="glass card"><div className="section-head"><div><span className="eyebrow">Recent activity</span><h2>Latest orders</h2></div><Link className="btn" href="/dashboard/orders">View all</Link></div>{sorted.length === 0 ? <div className="notice"><strong>Your account is ready.</strong><p className="muted" style={{ marginBottom: 0 }}>Add funds to your wallet, then choose a service when you are ready.</p></div> : sorted.slice(0, 5).map((doc) => <Link href={`/dashboard/orders/${doc.id}`} key={doc.id} style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "14px 0", borderBottom: "1px solid var(--line)" }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.get("serviceName")}</span><span className="status-pill">{String(doc.get("status") || "pending").replaceAll("_", " ")}</span></Link>)}</section><section className="glass card"><span className="eyebrow">Quick actions</span><h2>What would you like to do?</h2><div style={{ display: "grid", gap: 10 }}><Link className="btn primary" href="/dashboard/new-order"><PlusCircle size={18} /> Create a new order</Link><Link className="btn" href="/dashboard/wallet"><WalletCards size={18} /> Fund your wallet</Link><Link className="btn" href="/services"><ClipboardList size={18} /> Browse services</Link></div><div className="notice" style={{ marginTop: 18 }}><strong>Need help?</strong><p className="muted" style={{ marginBottom: 0 }}>Keep your payment transaction ID or order ID available when contacting support.</p></div></section></div></AppShell>;
}
