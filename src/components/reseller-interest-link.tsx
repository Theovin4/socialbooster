"use client";

import Link from "next/link";
import { trackAnalyticsEvent } from "@/lib/analytics";

export function ResellerInterestLink() {
  return <Link className="btn primary" href="/register?intent=reseller" onClick={() => trackAnalyticsEvent("reseller_interest", { surface: "resellers_page", action: "start_onboarding" })}>Start reseller onboarding</Link>;
}
