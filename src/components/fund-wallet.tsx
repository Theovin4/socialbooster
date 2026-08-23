"use client";

import { useState } from "react";
import { Toast } from "./toast";

export function FundWallet() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function start(form: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/payments/flutterwave/initialize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount: form.get("amount"), currency: "NGN" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Payment could not start");
      window.location.assign(data.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment could not start");
      setBusy(false);
    }
  }
  return <>{message ? <Toast key={message} kind="error" title="Checkout could not open" message={`${message}. Check your connection and try again.`} /> : null}<form action={start} style={{ display: "grid", gap: 12 }}><label>Amount in naira<input className="field" name="amount" type="number" min="100" max="5000000" step="1" placeholder="e.g. 5000" required /></label><div><button className="btn primary" disabled={busy}>{busy ? "Opening secure payment…" : "Continue to secure checkout"}</button></div></form></>;
}
