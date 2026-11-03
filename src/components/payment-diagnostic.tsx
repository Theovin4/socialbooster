"use client";

import { useState, useTransition } from "react";
import { searchFlutterwavePayments } from "@/app/admin/transactions/actions";

type SearchResult = Awaited<ReturnType<typeof searchFlutterwavePayments>>;
type Match = SearchResult["matches"][number];

function money(amountMinor: unknown, currency: unknown) {
  const amount = Number(amountMinor);
  if (!Number.isFinite(amount) || typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return "Not recorded";
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount / 100);
}

function ActivityList({ match }: { match: Match }) {
  const activity = match.subsequentWalletActivity;
  if (!activity.entries.length) return <p className="muted">{activity.evidenceAvailable ? "No later wallet activity found." : "Activity chronology is unavailable because the deposit timestamp is missing."}</p>;
  return <div style={{ display: "grid", gap: 8 }}>
    {activity.entries.map((entry) => <p className="muted" key={entry.id}>
      {entry.createdAt || "Date unavailable"} · {String(entry.type || "activity").replaceAll("_", " ")} · {money(entry.deltaMinor, entry.currency)}{entry.reason ? ` · ${String(entry.reason)}` : ""}
    </p>)}
    {activity.truncatedAtLimit ? <p className="muted">Showing the first {activity.limit} later entries; additional activity may exist.</p> : null}
  </div>;
}

function DiagnosticCard({ match }: { match: Match }) {
  const { paymentIntent: intent, walletDeposit: deposit, walletLedger: ledger, wallet, providerTransaction } = match;
  const danger = match.finalClassification === "PAYMENT NOT CREDITED";
  return <article className="glass card" style={{ display: "grid", gap: 14 }}>
    <div>
      <strong style={{ color: danger ? "#b42318" : undefined }}>{match.finalClassification}</strong>
      <p className="muted">Provider transaction {providerTransaction.transactionId || "not recorded"} · {providerTransaction.verification}</p>
      <p className="muted">Reference {match.reference || "not recorded"} · User {match.userId || "not identified"}{match.customerEmail ? ` · ${match.customerEmail}` : ""}</p>
    </div>
    <div>
      <strong>Payment intent</strong>
      <p className="muted">{intent.exists ? `${intent.status || "status unknown"} · Expected ${money(intent.expectedAmountMinor, intent.currency)} · provider transaction ${intent.providerTransactionId || "not recorded"}` : "Not found"}</p>
    </div>
    <div>
      <strong>Wallet deposit</strong>
      <p className="muted">{deposit ? `${String(deposit.status || "status unknown")} · ${money(deposit.deltaMinor, deposit.currency)} · balance before ${money(deposit.balanceBeforeMinor, deposit.currency)} · balance after ${money(deposit.balanceAfterMinor, deposit.currency)} · ${deposit.providerTransactionId ? "provider ID persisted" : "provider ID field absent (canonical ID/reference retained)"}` : "Not found"}</p>
    </div>
    <div>
      <strong>Wallet ledger</strong>
      <p className="muted">{ledger ? `${String(ledger.type || "entry")} · ${money(ledger.deltaMinor, ledger.currency)} · balance before ${money(ledger.balanceBeforeMinor, ledger.currency)} · balance after ${money(ledger.balanceAfterMinor, ledger.currency)} · ${ledger.providerTransactionId ? "provider ID persisted" : "provider ID field absent"}` : "Not found"}</p>
    </div>
    <div>
      <strong>Subsequent wallet activity</strong>
      <ActivityList match={match} />
      <p className="muted">Current wallet: {wallet.exists ? money(wallet.availableMinor ?? wallet.balanceMinor, wallet.currency) : "Not found"}</p>
    </div>
    <div>
      <strong>Payment event</strong>
      {match.paymentEvents.length
        ? match.paymentEvents.map((event) => <p className="muted" key={String(event.id)}>{String(event.id)} · {String(event.status || "status unknown")} · {String(event.source || "source unavailable")}</p>)
        : <p className="muted">No paymentEvent document found.</p>}
    </div>
  </article>;
}

export function PaymentDiagnostic() {
  const [result, setResult] = useState<SearchResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        setResult(await searchFlutterwavePayments(formData));
      } catch {
        setResult({ error: "The diagnostic could not complete. Please retry or check the server logs.", matches: [], truncated: false, message: null });
      }
    });
  }

  return <section className="glass card" style={{ marginBottom: 22 }}>
    <h2>Payment complaint diagnostic</h2>
    <p className="muted">Read-only Firestore evidence. Search by Flutterwave transaction ID, payment reference, customer email, or user ID. Provider verification is not called and no wallet is changed.</p>
    <form action={submit} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <input className="field" name="query" maxLength={254} placeholder="Transaction ID, reference, email, or user ID" required style={{ maxWidth: 480 }} />
      <button className="btn primary" disabled={isPending}>{isPending ? "Searching…" : "Search payments"}</button>
    </form>
    {result?.error ? <p role="alert" style={{ color: "#b42318" }}>{result.error}</p> : null}
    {result?.message ? <p className="muted">{result.message}</p> : null}
    {result?.truncated ? <p className="muted">Showing the first five matching payments. Refine the search for more specific results.</p> : null}
    {result?.matches?.length ? <div style={{ display: "grid", gap: 12, marginTop: 16 }}>{result.matches.map((match, index) => <DiagnosticCard key={`${match.reference || "unknown"}-${match.providerTransaction.transactionId || index}`} match={match} />)}</div> : null}
  </section>;
}
