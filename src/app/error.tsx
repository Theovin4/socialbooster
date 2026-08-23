"use client";

import { Toast } from "@/components/toast";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="shell" style={{ minHeight: "70vh", display: "grid", placeItems: "center" }}><Toast type="error" title="Something went wrong" message="We could not complete that action. Please try again." /><section className="glass card" style={{ width: "min(560px,100%)", textAlign: "center" }}><span className="eyebrow">Temporary issue</span><h1>This page could not load</h1><p className="muted">Your account and payment details remain safe. Try the action again, or contact support if it continues.</p><button className="btn primary" onClick={reset}>Try again</button></section></main>;
}
