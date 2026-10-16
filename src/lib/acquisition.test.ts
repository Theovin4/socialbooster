import { describe, expect, it } from "vitest";
import { normalizeAcquisitionTouch, normalizeGrowthContext, normalizeReferralCode } from "./acquisition";

describe("growth attribution safety", () => {
  it("normalizes bounded first-touch and last-touch campaign data", () => {
    const touch = normalizeAcquisitionTouch({ source: " Google Ads ", medium: "cpc", campaign: "October <launch>", landingPath: "/instagram?unsafe=1", capturedAt: "2026-10-01T12:00:00Z" });
    expect(touch).toMatchObject({ source: "Google Ads", medium: "cpc", campaign: "October launch", landingPath: "/instagram" });
    expect(normalizeGrowthContext({ firstTouch: touch, lastTouch: touch })).toMatchObject({ firstTouch: touch, lastTouch: touch });
  });

  it("accepts only non-personal referral code shapes", () => {
    expect(normalizeReferralCode(" sb12345678 ")).toBe("SB12345678");
    expect(normalizeReferralCode("customer@example.com")).toBeUndefined();
    expect(normalizeReferralCode("../unsafe")).toBeUndefined();
  });
});
