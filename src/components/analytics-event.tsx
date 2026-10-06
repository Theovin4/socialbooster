"use client";

import { useEffect } from "react";
import { trackAnalyticsEvent, type AnalyticsEvent, type AnalyticsParameters } from "@/lib/analytics";

export function AnalyticsEvent({ event, parameters = {}, deduplicationKey }: { event: AnalyticsEvent; parameters?: AnalyticsParameters; deduplicationKey?: string }) {
  const serializedParameters = JSON.stringify(parameters);
  useEffect(() => {
    trackAnalyticsEvent(event, JSON.parse(serializedParameters), deduplicationKey);
  }, [deduplicationKey, event, serializedParameters]);
  return null;
}
