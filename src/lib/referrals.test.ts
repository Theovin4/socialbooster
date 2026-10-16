import { describe, expect, it } from "vitest";
import { defaultReferralRewardRules, evaluateReferralReward, referralCodeForUser, referralEmailHash } from "./referrals";

describe("referral qualification safeguards", () => {
  it("creates stable non-email referral codes and normalized email hashes", () => {
    expect(referralCodeForUser("customer-1")).toMatch(/^SB[A-F0-9]{12}$/);
    expect(referralCodeForUser("customer-1")).toBe(referralCodeForUser("customer-1"));
    expect(referralEmailHash(" Customer@Example.com ")).toBe(referralEmailHash("customer@example.com"));
  });

  it("never qualifies a reward when the program is disabled", () => {
    expect(evaluateReferralReward({ rules: defaultReferralRewardRules, emailVerified: true, firstOrderValueMinor: 100_000, registeredAtMs: 0, completedAtMs: 86_400_000, monthlyRewardCount: 0 }).status).toBe("not_configured");
  });

  it("requires first-order value, verification, delay and monthly-cap checks", () => {
    const rules = { ...defaultReferralRewardRules, enabled: true, rewardMinor: 5_000, minimumFirstOrderMinor: 20_000, qualificationDelayDays: 2, monthlyRewardLimit: 1 };
    expect(evaluateReferralReward({ rules, emailVerified: true, firstOrderValueMinor: 19_999, registeredAtMs: 0, completedAtMs: 3 * 86_400_000, monthlyRewardCount: 0 }).status).toBe("not_eligible");
    expect(evaluateReferralReward({ rules, emailVerified: false, firstOrderValueMinor: 20_000, registeredAtMs: 0, completedAtMs: 86_400_000, monthlyRewardCount: 1 })).toMatchObject({ status: "review_required", riskFlags: expect.arrayContaining(["referred_email_unverified", "qualification_delay_active", "referrer_monthly_limit"]) });
    expect(evaluateReferralReward({ rules, emailVerified: true, firstOrderValueMinor: 20_000, registeredAtMs: 0, completedAtMs: 3 * 86_400_000, monthlyRewardCount: 0 }).status).toBe("pending_review");
  });
});
