import { describe, expect, it } from "vitest";
import { providerReviewAgeBucket, providerReviewAlertStage } from "./provider-review-policy";

describe("provider review escalation", () => {
  it("uses bounded reminder and escalation stages", () => {
    expect(providerReviewAlertStage(59 * 60_000)).toBe("none");
    expect(providerReviewAlertStage(60 * 60_000)).toBe("reminder");
    expect(providerReviewAlertStage(24 * 60 * 60_000)).toBe("escalation");
  });

  it("groups unresolved age without changing orders", () => {
    expect(providerReviewAgeBucket(1)).toBe("<15 minutes");
    expect(providerReviewAgeBucket(20 * 60_000)).toBe("15–60 minutes");
    expect(providerReviewAgeBucket(2 * 60 * 60_000)).toBe("1–6 hours");
    expect(providerReviewAgeBucket(8 * 60 * 60_000)).toBe("6–24 hours");
    expect(providerReviewAgeBucket(25 * 60 * 60_000)).toBe(">24 hours");
  });
});
