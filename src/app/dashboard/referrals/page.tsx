import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { ensureReferralCode } from "@/lib/growth-server";

export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  const user = await requireUser();
  const code = await ensureReferralCode(user.uid, user.email);
  const referrals = await adminDb().collection("referrals").where("referrerUserId", "==", user.uid).limit(50).get();
  const qualified = referrals.docs.filter((item) => item.get("status") === "qualified").length;
  const pending = referrals.docs.filter((item) => item.get("rewardStatus") === "pending_review").length;
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng").replace(/\/$/, "");
  const referralUrl = `${origin}/r/${code}`;
  return <AppShell><span className="eyebrow">Share responsibly</span><h1 className="page-heading">Referrals</h1><p className="muted page-lead">Invite people who would genuinely benefit from Social Booster. Your unique link records attribution without exposing your account details.</p>
    <section className="glass card"><h2>Your referral link</h2><div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}><input className="field" value={referralUrl} readOnly aria-label="Referral link" style={{ flex: "1 1 360px" }} /><Link className="btn primary" href={referralUrl}>Open link</Link></div><p className="muted">Code: <strong>{code}</strong></p></section>
    <div className="grid3" style={{ marginTop: 22 }}><article className="glass card stat-card"><span className="muted">Referred registrations</span><strong className="stat-value">{referrals.size.toLocaleString("en-NG")}</strong></article><article className="glass card stat-card"><span className="muted">First orders completed</span><strong className="stat-value">{qualified.toLocaleString("en-NG")}</strong></article><article className="glass card stat-card"><span className="muted">Pending reward review</span><strong className="stat-value">{pending.toLocaleString("en-NG")}</strong></article></div>
    <section className="glass card" style={{ marginTop: 22 }}><h2>How qualification works</h2><ul className="muted" style={{ lineHeight: 1.9 }}><li>A registration alone never earns a reward.</li><li>The referred customer must be a different verified person and complete their first eligible order.</li><li>Minimum-order, timing, monthly-limit and fraud checks apply under the current administrator-controlled rules.</li><li>Any reward remains pending until manual review. Wallets are never credited automatically.</li></ul></section>
  </AppShell>;
}
