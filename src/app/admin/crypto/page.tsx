import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/firebase/session";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { formatMoney } from "@/lib/money";
import { decideCryptoDeposit } from "./actions";
import { expireAwaitingCryptoDeposits } from "@/lib/payments/crypto-reconcile";
import { Toast } from "@/components/toast";

export const dynamic = "force-dynamic";

export default async function CryptoAdminPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireAdmin();
  await expireAwaitingCryptoDeposits();
  const { notice } = await searchParams;
  const snapshot = await adminDb().collection("cryptoDeposits").orderBy("createdAt", "desc").limit(100).get();
  const userIds = [...new Set(snapshot.docs.map((doc) => String(doc.get("userId"))))];
  const users = new Map<string, { email?: string; name?: string }>();
  await Promise.all(userIds.map(async (uid) => {
    try { const user = await adminAuth().getUser(uid); users.set(uid, { email: user.email, name: user.displayName }); }
    catch { users.set(uid, {}); }
  }));
  const pending = snapshot.docs.filter((doc) => !["approved", "rejected", "cancelled"].includes(String(doc.get("status"))));
  return <AppShell admin>
    {notice === "error" ? <Toast type="error" title="Action not completed" message="The payment record was not changed. Refresh and try again, or review the transaction evidence." /> : notice ? <Toast type="success" title="Crypto payment updated" message={notice === "approved" ? "The confirmed payment was verified and the equivalent wallet amount was credited." : notice === "cancelled" ? "The unpaid payment request was cancelled." : notice === "rejected" ? "The payment was rejected without wallet credit." : "The latest blockchain status has been saved."} /> : null}
    <span className="eyebrow">Controlled settlement</span>
    <h1 className="page-heading">Crypto payments</h1>
    <p className="muted page-lead">Review automatic blockchain evidence before approving wallet credit. Approval rechecks the transaction and cannot credit the same hash twice.</p>
    <div className="grid3">
      <article className="glass card stat-card"><span className="muted">Awaiting decision</span><strong className="stat-value">{pending.length}</strong></article>
      <article className="glass card stat-card"><span className="muted">Verified, awaiting approval</span><strong className="stat-value">{snapshot.docs.filter((doc) => doc.get("status") === "verified_pending_approval").length}</strong></article>
      <article className="glass card stat-card"><span className="muted">Verified and credited</span><strong className="stat-value">{snapshot.docs.filter((doc) => doc.get("status") === "approved").length}</strong></article>
    </div>
    <div style={{ display: "grid", gap: 16, marginTop: 22 }}>
      {snapshot.empty ? <div className="glass card"><h2>No crypto payments yet</h2><p className="muted">Customer crypto submissions will appear here.</p></div> : snapshot.docs.map((doc) => {
        const item = doc.data(), status = String(item.status || "pending"), terminal = ["approved", "rejected", "cancelled"].includes(status), user = users.get(String(item.userId)), statusLabel = status === "approved" ? "verified and credited" : status.replaceAll("_", " ");
        return <article className="glass card" key={doc.id}>
          <div className="section-head"><div><span className="eyebrow">{String(item.network || "").replaceAll("_", " ")}</span><h2 style={{ marginBottom: 6 }}>{formatMoney(BigInt(Number(item.creditedNgnMinor || item.requestedNgnMinor || 0)), "NGN")}</h2><p className="muted" style={{ margin: 0 }}>{user?.name || "Customer"} · {user?.email || item.userId}</p></div><span className="status-pill">{statusLabel}</span></div>
          <div className="form-grid"><div><strong>Expected</strong><p className="muted">{Number(item.expectedAssetAmount || 0).toFixed(item.asset === "BTC" ? 8 : 6)} {item.asset}</p></div><div><strong>Verified</strong><p className="muted">{item.verifiedAmount == null ? "Not yet" : `${Number(item.verifiedAmount).toFixed(item.asset === "BTC" ? 8 : 6)} ${item.asset}`} · {Number(item.confirmations || 0)} confirmations</p></div><div className="form-span"><strong>Transaction hash</strong><p className="muted" style={{ overflowWrap: "anywhere" }}>{item.txHash || "Not submitted"}</p>{item.verificationReason ? <p style={{ color: "#fbbf24" }}>{item.verificationReason}</p> : null}</div></div>
          {!terminal ? <form action={decideCryptoDeposit} className="form-grid"><input type="hidden" name="id" value={doc.id} /><input className="field form-span" name="reason" placeholder="Reason required for rejection or cancellation" /><button className="btn" name="decision" value="recheck" disabled={!item.txHash}>Recheck blockchain</button><button className="btn primary" name="decision" value="approve" disabled={status !== "verified_pending_approval"}>Reverify and approve</button><button className="btn" name="decision" value="reject">Reject</button><button className="btn" name="decision" value="cancel">Cancel</button></form> : item.decisionReason ? <p className="muted">Decision reason: {item.decisionReason}</p> : null}
        </article>;
      })}
    </div>
  </AppShell>;
}
