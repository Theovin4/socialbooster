import { AppShell } from "@/components/app-shell";
import { ApiKeyForm } from "@/components/api-key-form";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { revokeApiKey } from "./actions";

export const dynamic = "force-dynamic";

export default async function CustomerApiPage() {
  const user = await requireUser();
  const snapshot = await adminDb().collection("customerApiKeys").where("userId", "==", user.uid).limit(10).get();
  const keys = snapshot.docs.sort((a, b) => (b.get("createdAt")?.toMillis?.() || 0) - (a.get("createdAt")?.toMillis?.() || 0));
  return <AppShell>
    <span className="eyebrow">Developer access</span><h1 className="page-heading">Social Booster API</h1>
    <p className="muted page-lead">Connect your website or application to your Social Booster account. API orders use your existing wallet balance and the same customer prices shown in your account.</p>
    <section className="glass card" style={{ marginTop: 22 }}><h2>API keys</h2><p className="muted">Create up to three keys. Keep them private and revoke a key immediately if it is exposed.</p><ApiKeyForm />
      <div style={{ display: "grid", gap: 10, marginTop: 22 }}>{keys.length ? keys.map((doc) => <div key={doc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: 14, border: "1px solid var(--line)", borderRadius: 14 }}><div><strong>{doc.get("label")}</strong><p className="muted" style={{ margin: "5px 0 0" }}>{doc.get("prefix")} · {doc.get("status") === "active" ? "Active" : "Revoked"}</p></div>{doc.get("status") === "active" ? <form action={revokeApiKey}><input type="hidden" name="id" value={doc.id} /><button className="btn">Revoke</button></form> : null}</div>) : <p className="muted">No API keys created yet.</p>}</div>
    </section>
    <section className="glass card" style={{ marginTop: 22 }}><span className="eyebrow">API v2</span><h2>Integration guide</h2><p className="muted">Send HTTPS POST requests to <code>https://socialbooster.net.ng/api/v2</code>. Authenticate with <code>Authorization: Bearer YOUR_API_KEY</code>. JSON and form data are supported. The limit is 120 requests per minute per key.</p>
      <h3>Available actions</h3><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Action</th><th>Required values</th><th>Purpose</th></tr></thead><tbody><tr><td><code>services</code></td><td>None</td><td>List active services and rates.</td></tr><tr><td><code>balance</code></td><td>None</td><td>Read your wallet balance.</td></tr><tr><td><code>add</code></td><td>service, link, quantity</td><td>Place one order.</td></tr><tr><td><code>status</code></td><td>order</td><td>Read delivery progress.</td></tr></tbody></table></div>
      <h3>Example request</h3><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: 16, border: "1px solid var(--line)", borderRadius: 14 }}><code>{`curl -X POST https://socialbooster.net.ng/api/v2 \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"action":"services"}'`}</code></pre>
      <div className="notice"><strong>Order safety</strong><p className="muted" style={{ marginBottom: 0 }}>For retry-safe order creation, include a unique <code>idempotency_key</code> with every <code>add</code> request. Reusing it returns the original order instead of charging twice.</p></div>
    </section>
  </AppShell>;
}
