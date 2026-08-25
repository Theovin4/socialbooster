"use client";

import { useState } from "react";
import { Toast } from "./toast";

type Quote = { depositId: string; label: string; asset: string; address: string; expectedAssetAmount: string; requestedNgnMinor: number; expiresAt: string };

export function CryptoFunding() {
  const [quote, setQuote] = useState<Quote | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [kind, setKind] = useState<"success" | "error" | "info">("info");
  async function requestQuote(form: FormData) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/payments/crypto/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amountNgn: form.get("amountNgn"), network: form.get("network") }) }), data = await response.json();
      if (!response.ok) throw new Error(data.error || "A crypto quote could not be created");
      setQuote(data); setKind("info"); setMessage("Your 18-minute payment quote is ready. Send payment on the selected network and submit the transaction hash before it expires.");
    } catch (error) { setKind("error"); setMessage(error instanceof Error ? error.message : "A crypto quote could not be created"); }
    finally { setBusy(false); }
  }
  async function submitHash(form: FormData) {
    if (!quote) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/payments/crypto/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ depositId: quote.depositId, txHash: form.get("txHash") }) }), data = await response.json();
      if (!response.ok) throw new Error(data.error || "Transaction could not be submitted");
      setKind(data.status === "verification_failed" ? "error" : data.status === "verified_pending_approval" ? "success" : "info"); setMessage(data.message); setQuote(null);
    } catch (error) { setKind("error"); setMessage(error instanceof Error ? error.message : "Transaction could not be submitted"); }
    finally { setBusy(false); }
  }
  return <div style={{ display: "grid", gap: 18 }}>
    {message ? <Toast key={message} kind={kind} title={kind === "success" ? "Transaction received" : kind === "error" ? "Action required" : "Crypto payment"} message={message} /> : null}
    {!quote ? <form action={requestQuote} className="form-grid">
      <label>Amount to receive in your wallet (NGN)<input className="field" name="amountNgn" type="number" min="1000" max="5000000" step="1" placeholder="e.g. 5000" required /></label>
      <label>Payment network<select className="field" name="network" defaultValue="usdt_trc20"><option value="usdt_trc20">USDT (TRC20)</option><option value="usdt_bep20">USDT (BEP20)</option><option value="usdt_solana">USDT (Solana)</option><option value="btc">Bitcoin</option></select></label>
      <div className="form-span"><button className="btn primary" disabled={busy}>{busy ? "Getting live quote…" : "Get crypto payment quote"}</button></div>
    </form> : <div className="notice" style={{ display: "grid", gap: 14 }}>
      <div><strong>{quote.label}</strong><p className="muted" style={{ marginBottom: 0 }}>Send exactly <strong style={{ color: "white" }}>{quote.expectedAssetAmount} {quote.asset}</strong> to receive NGN {(quote.requestedNgnMinor / 100).toLocaleString("en-NG")} after approval.</p></div>
      <label>Deposit address<input className="field" value={quote.address} readOnly onFocus={(event) => event.currentTarget.select()} /></label>
      <div className="muted" style={{ fontSize: 14 }}>This payment quote expires at {new Date(quote.expiresAt).toLocaleTimeString("en-NG")}.</div>
      <div style={{ color: "#fbbf24", fontWeight: 700 }}>Use only {quote.label}. Sending another token or network may permanently lose your funds.</div>
      <form action={submitHash} style={{ display: "grid", gap: 12 }}><label>Transaction hash / transaction ID<input className="field" name="txHash" autoComplete="off" minLength={32} required /></label><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><button className="btn primary" disabled={busy}>{busy ? "Checking blockchain…" : "I have paid — verify transaction"}</button><button className="btn" type="button" onClick={() => setQuote(null)} disabled={busy}>Cancel quote</button></div></form>
    </div>}
  </div>;
}
