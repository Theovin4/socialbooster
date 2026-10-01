"use client";

import { useEffect } from "react";
import { trackAnalyticsEvent, type AnalyticsEvent } from "@/lib/analytics";

export function AnalyticsEvent({ event, parameters = {} }: { event: AnalyticsEvent; parameters?: Record<string, string | number | boolean> }) {
  const serializedParameters = JSON.stringify(parameters);
  useEffect(() => {
    trackAnalyticsEvent(event, JSON.parse(serializedParameters));
  }, [event, serializedParameters]);
  return null;
}
