"use client";

import { useActionState } from "react";
import { createApiKey, type ApiKeyActionState } from "@/app/dashboard/api/actions";

const initialState: ApiKeyActionState = { status: "idle", message: "" };

export function ApiKeyForm() {
  const [state, action, pending] = useActionState(createApiKey, initialState);
  return <div>
    <form action={action} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <input className="field" name="label" maxLength={50} placeholder="Key name, e.g. Website integration" aria-label="API key name" required />
      <button className="btn primary" disabled={pending}>{pending ? "Creating…" : "Create API key"}</button>
    </form>
    {state.message ? <div className={`notice${state.status === "error" ? " danger" : ""}`} style={{ marginTop: 14 }}><strong>{state.message}</strong>{state.key ? <><code style={{ display: "block", overflowWrap: "anywhere", marginTop: 12 }}>{state.key}</code><p className="muted" style={{ marginBottom: 0 }}>Store it securely. Anyone with this key can place orders using your wallet balance.</p></> : null}</div> : null}
  </div>;
}
