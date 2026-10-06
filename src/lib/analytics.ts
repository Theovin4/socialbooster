export const analyticsEvents = [
  "login",
  "sign_up",
  "search",
  "view_item_list",
  "view_item",
  "begin_checkout",
  "add_payment_info",
  "purchase",
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
  "api_key_created",
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
  if (typeof window.gtag === "function") window.gtag("event", event, parameters);
  else {
    window.dataLayer ||= [];
    window.dataLayer.push({ event, ...parameters });
  }
}
