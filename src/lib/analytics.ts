export const analyticsEvents = [
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
type SafeParameters = Record<string, string | number | boolean>;

declare global {
  interface Window {
    gtag?: (command: "event", event: AnalyticsEvent, parameters?: SafeParameters) => void;
    dataLayer?: Array<Record<string, unknown> | IArguments>;
  }
}

/** Privacy-safe analytics only: never pass email, names, target URLs, or credentials. */
export function trackAnalyticsEvent(event: AnalyticsEvent, parameters: SafeParameters = {}) {
  if (typeof window === "undefined") return;
  if (typeof window.gtag === "function") window.gtag("event", event, parameters);
  else {
    window.dataLayer ||= [];
    window.dataLayer.push({ event, ...parameters });
  }
}
