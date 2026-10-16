import { createHash } from "node:crypto";

export type ReferralRewardRules = {
  enabled: boolean;
  rewardMinor: number;
  minimumFirstOrderMinor: number;
  qualificationDelayDays: number;
  monthlyRewardLimit: number;
  version: number;
};

export const defaultReferralRewardRules: ReferralRewardRules = {
  enabled: false,
  rewardMinor: 0,
  minimumFirstOrderMinor: 0,
  qualificationDelayDays: 0,
  monthlyRewardLimit: 20,
  version: 1,
};

function safeInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function referralRewardRules(data: Record<string, unknown> | undefined): ReferralRewardRules {
  return {
    enabled: data?.enabled === true,
    rewardMinor: safeInteger(data?.rewardMinor, 0),
    minimumFirstOrderMinor: safeInteger(data?.minimumFirstOrderMinor, 0),
    qualificationDelayDays: Math.min(90, safeInteger(data?.qualificationDelayDays, 0)),
    monthlyRewardLimit: Math.min(1_000, safeInteger(data?.monthlyRewardLimit, 20)),
    version: Math.max(1, safeInteger(data?.version, 1)),
  };
}

export function referralCodeForUser(userId: string) {
  return `SB${createHash("sha256").update(`socialbooster:${userId}`).digest("hex").slice(0, 12)}`.toUpperCase();
}

export function referralEmailHash(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function evaluateReferralReward(input: {
  rules: ReferralRewardRules;
  emailVerified: boolean;
  firstOrderValueMinor: number;
  registeredAtMs: number;
  completedAtMs: number;
  monthlyRewardCount: number;
}) {
  const riskFlags: string[] = [];
  if (!input.rules.enabled || input.rules.rewardMinor <= 0) return { status: "not_configured" as const, riskFlags };
  if (!input.emailVerified) riskFlags.push("referred_email_unverified");
  if (input.firstOrderValueMinor < input.rules.minimumFirstOrderMinor) riskFlags.push("below_minimum_first_order");
  const eligibleAtMs = input.registeredAtMs + input.rules.qualificationDelayDays * 86_400_000;
  if (input.completedAtMs < eligibleAtMs) riskFlags.push("qualification_delay_active");
  if (input.monthlyRewardCount >= input.rules.monthlyRewardLimit) riskFlags.push("referrer_monthly_limit");
  if (riskFlags.includes("below_minimum_first_order")) return { status: "not_eligible" as const, riskFlags, eligibleAtMs };
  if (riskFlags.length) return { status: "review_required" as const, riskFlags, eligibleAtMs };
  return { status: "pending_review" as const, riskFlags, eligibleAtMs };
}
