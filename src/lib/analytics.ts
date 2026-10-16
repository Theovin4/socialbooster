import { normalizeAcquisitionTouch, normalizeGrowthContext, normalizeReferralCode, type GrowthContext } from "./acquisition";

export const analyticsEvents = [
  "page_view",
  "login",
  "sign_up",
  "search",
  "select_item",
  "view_item_list",
  "view_item",
  "begin_checkout",
  "add_payment_info",
  "purchase",
  "refund",
  "registration_error",
  "service_search",
  "service_view",
  "register_start",
  "register_complete",
  "wallet_fund_start",
  "wallet_fund_success",
  "order_start",
  "order_success",
  "order_failure",
  "first_order",
  "repeat_purchase",
  "api_key_created",
  "reseller_interest",
  "support_ticket_created",
] as const;

export type AnalyticsEvent = (typeof analyticsEvents)[number];
export type AnalyticsParameters = Record<string, unknown>;

declare global {
  interface Window {
    gtag?: (command: "event", event: string, parameters?: AnalyticsParameters) => void;
    dataLayer?: Array<Record<string, unknown> | IArguments>;
  }
}

/** Privacy-safe analytics only: never pass email, names, target URLs, or credentials. */
function hasAnalyticsConsent() {
  try {
    const value = window.localStorage.getItem("sb_privacy_consent_v1");
    if (!value) return false;
    return JSON.parse(value)?.analytics === true;
  } catch {
    return false;
  }
}

/** Records one event per persistent browser for the supplied non-personal key. */
const forbiddenKeys = /(?:email|phone|password|token|api_?key|wallet_?address|auth|target_?url)/i;
const sensitiveValue = /(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|https?:\/\/|\bsb_live_[A-Za-z0-9_-]+\b|\b(?:\+?\d[\s-]?){10,15}\b)/i;

export function sanitizeAnalyticsParameters(parameters: AnalyticsParameters): AnalyticsParameters {
  const clean = (value: unknown, key = ""): unknown => {
    if (forbiddenKeys.test(key)) return undefined;
    if (typeof value === "string") return sensitiveValue.test(value) ? undefined : value.slice(0, 200);
    if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
    if (Array.isArray(value)) return value.slice(0, 25).map((item) => clean(item)).filter((item) => item !== undefined);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [childKey, clean(childValue, childKey)]).filter(([, childValue]) => childValue !== undefined));
    return undefined;
  };
  return clean(parameters) as AnalyticsParameters;
}

function attributionParameters() {
  try {
    const stored = normalizeGrowthContext(JSON.parse(window.localStorage.getItem("sb_attribution_v2") || "null"));
    const touch = stored.lastTouch;
    return touch ? sanitizeAnalyticsParameters({ utm_source: touch.source, utm_medium: touch.medium, utm_campaign: touch.campaign, utm_content: touch.content, utm_term: touch.term }) : {};
  } catch { return {}; }
}

export function captureClientGrowthContext(pathname: string, analyticsConsent: boolean) {
  if (typeof window === "undefined") return;
  const query = new URLSearchParams(window.location.search);
  const referralCode = normalizeReferralCode(query.get("ref"));
  if (referralCode) {
    window.localStorage.setItem("sb_referral_v1", referralCode);
    window.localStorage.setItem("sb_referral_captured_at_v1", new Date().toISOString());
  }
  if (query.get("intent") === "reseller") window.localStorage.setItem("sb_growth_intent_v1", "reseller");
  if (!analyticsConsent) return;
  const source = query.get("utm_source")?.trim();
  const medium = query.get("utm_medium")?.trim();
  const campaign = query.get("utm_campaign")?.trim();
  if (!source && !medium && !campaign) return;
  const touch = normalizeAcquisitionTouch({
    source: source || "direct_or_unknown",
    medium: medium || "none",
    campaign: campaign || "unattributed",
    content: query.get("utm_content"),
    term: query.get("utm_term"),
    landingPath: pathname,
    capturedAt: new Date().toISOString(),
  });
  if (!touch) return;
  const stored = readClientGrowthContext();
  window.localStorage.setItem("sb_attribution_v2", JSON.stringify({ firstTouch: stored.firstTouch || touch, lastTouch: touch }));
}

export function readClientGrowthContext(): GrowthContext {
  if (typeof window === "undefined") return {};
  try {
    const stored = normalizeGrowthContext(JSON.parse(window.localStorage.getItem("sb_attribution_v2") || "null"));
    const referralCapturedAt = new Date(window.localStorage.getItem("sb_referral_captured_at_v1") || 0).getTime();
    const referralCurrent = Number.isFinite(referralCapturedAt) && Date.now() - referralCapturedAt <= 30 * 86_400_000;
    const referralCode = referralCurrent ? normalizeReferralCode(window.localStorage.getItem("sb_referral_v1")) : undefined;
    if (!referralCurrent) {
      window.localStorage.removeItem("sb_referral_v1");
      window.localStorage.removeItem("sb_referral_captured_at_v1");
    }
    return {
      ...stored,
      ...(referralCode ? { referralCode } : {}),
      ...(window.localStorage.getItem("sb_growth_intent_v1") === "reseller" ? { resellerInterest: true } : {}),
    };
  } catch {
    return {};
  }
}

export function trackAnalyticsEvent(event: AnalyticsEvent, parameters: AnalyticsParameters = {}, deduplicationKey?: string) {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;
  if (deduplicationKey) {
    try {
      const key = `sb_analytics:${deduplicationKey}`;
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, new Date().toISOString());
    } catch { /* Analytics continues without browser-level deduplication when storage is unavailable. */ }
  }
  const safeParameters = { ...attributionParameters(), ...sanitizeAnalyticsParameters(parameters) };
  if (typeof window.gtag === "function") window.gtag("event", event, safeParameters);
  else {
    window.dataLayer ||= [];
    window.dataLayer.push({ event, ...safeParameters });
  }
}
