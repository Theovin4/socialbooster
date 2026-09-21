"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { applyActionCode } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";

export function VerifyEmailClient({ code }: { code?: string }) {
  const [state, setState] = useState<"working" | "failed">(() => code ? "working" : "failed");
  useEffect(() => {
    if (!code) return;
    applyActionCode(firebaseAuth(), code)
      .then(() => { window.location.replace("/login?notice=email-verified"); })
      .catch(() => setState("failed"));
  }, [code]);
  if (state === "working") return <><h1 style={{ fontSize: 36, margin: "32px 0 8px" }}>Confirming your email</h1><p className="muted">Please wait a moment. You will be taken to sign in automatically.</p></>;
  return <><h1 style={{ fontSize: 36, margin: "32px 0 8px" }}>This link is no longer active</h1><p className="muted">Your email may already be verified, or the link may have expired. Sign in to continue or request a fresh link from your dashboard.</p><Link className="btn primary" href="/login" style={{ marginTop: 18 }}>Continue to sign in</Link></>;
}
