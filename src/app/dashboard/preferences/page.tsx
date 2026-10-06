import { AppShell } from "@/components/app-shell";
import { Toast } from "@/components/toast";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { updateEmailPreferences } from "./actions";
import { marketingTopics } from "@/lib/marketing";

export const dynamic = "force-dynamic";

export default async function PreferencesPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requireUser();
  const [profile, params] = await Promise.all([adminDb().collection("marketingProfiles").doc(user.uid).get(), searchParams]);
  const subscribed = profile.get("marketingConsent") === true;
  const topicPreferences = (profile.get("topicPreferences") || {}) as Record<string, boolean>;
  const blocked = ["bounced", "complained", "suppressed"].includes(String(profile.get("emailStatus") || "active"));
  return <AppShell>
    {params.notice === "subscribed" ? <Toast type="success" title="Email preferences updated" message="You are subscribed to useful Social Booster product and educational updates." /> : params.notice === "unsubscribed" ? <Toast type="success" title="Marketing emails stopped" message="You will still receive essential account, payment, security and order messages." /> : params.notice === "paused" ? <Toast type="info" title="Marketing remains paused" message="Your preference was saved safely, but marketing delivery is not active for this address yet." /> : null}
    <span className="eyebrow">Communication controls</span><h1 className="page-heading">Email preferences</h1><p className="muted page-lead">Choose whether to receive optional product guidance and service announcements. Essential account, security, wallet and order emails are not marketing and remain active.</p>
    <form action={updateEmailPreferences} className="glass card" style={{ maxWidth: 760 }}>
      <label style={{ display: "flex", gap: 14, alignItems: "flex-start" }}><input type="checkbox" name="marketing" defaultChecked={subscribed && !blocked} disabled={blocked} style={{ marginTop: 5 }} /><span><strong>Receive optional email updates</strong><span className="muted" style={{ display: "block", marginTop: 6, lineHeight: 1.6 }}>Enable the categories you want below. You can unsubscribe from all optional marketing at any time.</span></span></label>
      <div style={{ display: "grid", gap: 12, marginTop: 22 }}>{marketingTopics.map((topic) => <label key={topic.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 14, border: "1px solid var(--border)", borderRadius: 14 }}><input type="checkbox" name={`topic_${topic.id}`} defaultChecked={topicPreferences[topic.id] === true} disabled={blocked} style={{ marginTop: 5 }} /><span><strong>{topic.label}</strong><span className="muted" style={{ display: "block", marginTop: 4 }}>{topic.description}</span></span></label>)}</div>
      {blocked ? <p className="notice">Marketing delivery is suppressed for this address because of a delivery or complaint signal. Support cannot override a provider suppression without verified resolution.</p> : null}<button className="btn primary" type="submit" disabled={blocked} style={{ marginTop: 22 }}>Save preferences</button>
    </form>
  </AppShell>;
}
