import Link from "next/link";
import { ArrowUpRight, ClipboardList, PlusCircle, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Toast } from "@/components/toast";
import { VerificationNotice } from "@/components/verification-notice";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requireUser();
  const { notice } = await searchParams;
  const account = await adminAuth().getUser(user.uid).catch(() => null);
  const firstName = account?.displayName?.trim().split(/\s+/)[0] || user.name?.trim().split(/\s+/)[0] || "there";
  let dataAvailable = true;
  let walletData: FirebaseFirestore.DocumentData = {};
  let orderDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  let active = 0, completed = 0;
  const db = adminDb();
  const results = await Promise.allSettled([
    db.collection("wallets").doc(user.uid).get(),
    db.collection("orders").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(5).get(),
    db.collection("orders").where("userId", "==", user.uid).where("status", "in", ["pending", "processing", "in_progress", "submitting", "provider_confirmation_required", "cancel_requested"]).count().get(),
    db.collection("orders").where("userId", "==", user.uid).where("status", "==", "completed").count().get(),
  ] as const);
  if (results.some((result) => result.status === "rejected")) {
    dataAvailable = false;
    results.forEach((result, index) => { if (result.status === "rejected") console.error("[dashboard] account metric unavailable", { userId: user.uid, metric: ["wallet", "recentOrders", "activeOrders", "completedOrders"][index], error: result.reason instanceof Error ? result.reason.message : "Unknown error" }); });
  }
  if (results[0].status === "fulfilled") walletData = results[0].value.data() || {};
  if (results[1].status === "fulfilled") orderDocs = results[1].value.docs;
  if (results[2].status === "fulfilled") active = Number(results[2].value.data().count || 0);
  if (results[3].status === "fulfilled") completed = Number(results[3].value.data().count || 0);
  const available = Number(walletData.availableMinor ?? walletData.balanceMinor ?? 0);
  const currency = String(walletData.currency || "NGN");
  const sorted = orderDocs;
  const cards = [["Available balance", dataAvailable ? formatMoney(BigInt(available), currency) : "Updating…", WalletCards], ["Active orders", dataAvailable ? String(active) : "Updating…", ClipboardList], ["Completed orders", dataAvailable ? String(completed) : "Updating…", ArrowUpRight]] as const;

  return <AppShell>
    {notice === "welcome" ? <Toast kind="success" title={`Welcome, ${firstName}`} message="Signed in successfully." /> : notice === "account-created" ? <Toast kind="success" title={`Welcome, ${firstName}`} message="Your account is ready to use. Please verify your email when convenient." /> : null}
    <h1 className="page-heading">Welcome back, {firstName}.</h1>
    {account && !account.emailVerified ? <VerificationNotice /> : null}
    <div className="grid3">{cards.map(([label, value, Icon]) => <article className="glass card stat-card" key={label}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span className="muted">{label}</span><Icon size={20} color="#63d9ff" /></div><strong className="stat-value">{value}</strong></article>)}</div>
    <div className="form-grid" style={{ marginTop: 22 }}>
      <section className="glass card"><div className="section-head"><h2>Latest orders</h2><Link className="btn" href="/dashboard/orders">View all</Link></div>{!dataAvailable ? <div className="notice"><strong>Refreshing your account.</strong><p className="muted" style={{ marginBottom: 0 }}>You can continue using the menu while your latest activity updates.</p></div> : sorted.length === 0 ? <div className="notice"><strong>No orders yet.</strong><p className="muted" style={{ marginBottom: 0 }}>Fund your wallet, then choose a service.</p></div> : sorted.slice(0, 5).map((doc) => <Link href={`/dashboard/orders/${doc.id}`} key={doc.id} style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "14px 0", borderBottom: "1px solid var(--line)" }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.get("serviceName")}</span><span className="status-pill">{String(doc.get("status") || "pending").replaceAll("_", " ")}</span></Link>)}</section>
      <section className="glass card"><h2>Quick actions</h2><div style={{ display: "grid", gap: 10 }}><Link className="btn primary" href="/dashboard/new-order"><PlusCircle size={18} /> New order</Link><Link className="btn" href="/dashboard/wallet"><WalletCards size={18} /> Fund wallet</Link><Link className="btn" href="/dashboard/new-order"><ClipboardList size={18} /> Browse services</Link></div></section>
    </div>
  </AppShell>;
}
