"use client";

import { useState } from "react";
import { MailCheck } from "lucide-react";

export function VerificationNotice() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  async function resend() {
    setState("sending");
    const response = await fetch("/api/auth/resend-verification", { method: "POST" }).catch(() => null);
    setState(response?.ok ? "sent" : "failed");
  }
  return <div className="notice verification-notice" style={{ marginBottom: 22 }}>
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
      <MailCheck size={22} color="#63d9ff" aria-hidden="true" />
      <div style={{ flex: "1 1 280px" }}><strong>Verify your email address</strong><p className="muted" style={{ margin: "6px 0 0" }}>Your account is active. Verify your email to secure account recovery and receive important service updates.</p></div>
      <button className="btn" type="button" disabled={state === "sending" || state === "sent"} onClick={resend}>{state === "sending" ? "Sending…" : state === "sent" ? "Email sent" : "Resend email"}</button>
    </div>
    {state === "failed" ? <p className="form-hint warning" style={{ marginBottom: 0 }}>We could not send another message just now. Please try again in a few minutes.</p> : null}
  </div>;
}
