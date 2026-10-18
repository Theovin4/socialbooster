export type ProviderReviewAlertStage = "none" | "reminder" | "escalation";
export const providerReviewStageRank: Record<ProviderReviewAlertStage, number> = { none: 0, reminder: 1, escalation: 2 };

export function providerReviewAlertStage(ageMs: number, reminderMinutes = 60, escalationHours = 24): ProviderReviewAlertStage {
  if (ageMs >= escalationHours * 60 * 60 * 1000) return "escalation";
  if (ageMs >= reminderMinutes * 60 * 1000) return "reminder";
  return "none";
}

export function providerReviewAgeBucket(ageMs: number) {
  if (ageMs < 15 * 60 * 1000) return "<15 minutes";
  if (ageMs < 60 * 60 * 1000) return "15–60 minutes";
  if (ageMs < 6 * 60 * 60 * 1000) return "1–6 hours";
  if (ageMs < 24 * 60 * 60 * 1000) return "6–24 hours";
  return ">24 hours";
}
