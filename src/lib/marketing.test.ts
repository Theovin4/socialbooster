import { afterEach, describe, expect, it } from "vitest";
import { campaignCanSend, canReceiveMarketing, isMarketingSegment, isMarketingTemplate, isMarketingTopic, marketingSegmentMemberships, marketingSendingEnabled, normalizeEmail } from "./marketing";
import { renderMarketingEmail } from "./marketing-email";

const originalEnabled = process.env.MARKETING_EMAIL_ENABLED;

afterEach(() => {
  process.env.MARKETING_EMAIL_ENABLED = originalEnabled;
});

describe("marketing safety", () => {
  it("requires explicit consent, eligibility and healthy delivery status", () => {
    expect(canReceiveMarketing({ marketingConsent: true, marketingEligible: true, marketingStatus: "active", emailStatus: "active" })).toBe(true);
    expect(canReceiveMarketing({ marketingConsent: false, marketingEligible: true, marketingStatus: "active", emailStatus: "active" })).toBe(false);
    expect(canReceiveMarketing({ marketingConsent: true, marketingEligible: false, marketingStatus: "suppressed", emailStatus: "bounced" })).toBe(false);
  });

  it("keeps production sending disabled unless explicitly enabled", () => {
    process.env.MARKETING_EMAIL_ENABLED = "false";
    expect(marketingSendingEnabled()).toBe(false);
    expect(campaignCanSend({ status: "scheduled", recipientCount: 10, sendingEnabled: false })).toBe(false);
    expect(campaignCanSend({ status: "draft", recipientCount: 10, sendingEnabled: true })).toBe(false);
  });

  it("accepts only controlled templates and segments", () => {
    expect(isMarketingTemplate("announcement")).toBe(true);
    expect(isMarketingTemplate("custom-html")).toBe(false);
    expect(isMarketingSegment("funded_no_order")).toBe(true);
    expect(isMarketingSegment("everyone-in-firestore")).toBe(false);
    expect(isMarketingTopic("guides")).toBe(true);
    expect(isMarketingTopic("transactional-security")).toBe(false);
    expect(normalizeEmail(" Customer@Example.COM ")).toBe("customer@example.com");
  });

  it("derives only consented lifecycle segment memberships", () => {
    const now = new Date("2026-10-06T12:00:00.000Z");
    const profile = { marketingConsent: true, marketingEligible: true, marketingStatus: "active", emailStatus: "active", completedOrderCount: 3, lifetimeOrderValueMinor: 600_000, walletFunded: true, resellerOrApi: true, hasUsedCrypto: true, lastOrderAt: new Date("2026-09-20T12:00:00.000Z") };
    expect(marketingSegmentMemberships(profile, now)).toEqual(expect.arrayContaining(["eligible", "active", "repeat", "vip", "reseller_api", "crypto"]));
    expect(marketingSegmentMemberships({ ...profile, marketingConsent: false }, now)).toEqual([]);
  });
});

describe("marketing email renderer", () => {
  it("adds campaign attribution, preference and one-click unsubscribe links", () => {
    const result = renderMarketingEmail({ templateId: "education", campaignId: "campaign-123" });
    expect(result.html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    expect(result.html).toContain("/dashboard/preferences");
    expect(result.ctaUrl).toContain("utm_source=resend");
    expect(result.ctaUrl).toContain("utm_campaign=campaign-123");
  });

  it("escapes administrator-entered content and rejects outside links", () => {
    const result = renderMarketingEmail({ templateId: "announcement", campaignId: "safe", heading: "<script>alert(1)</script>" });
    expect(result.html).not.toContain("<script>alert(1)</script>");
    expect(result.html).toContain("&lt;script&gt;");
    expect(() => renderMarketingEmail({ templateId: "announcement", campaignId: "safe", ctaUrl: "https://example.com/phish" })).toThrow("Social Booster domain");
  });
});
