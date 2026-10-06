import { describe, expect, it } from "vitest";
import { evaluateServiceQuality, normalizePublicServiceName, normalizeServiceCategory } from "./service-quality";

const valid = { name: "Instagram followers", category: "Instagram", min: 10, max: 10_000, rateMinor: 1250n, providerFunded: true };

describe("service quality", () => {
  it("publishes a funded, orderable service", () => expect(evaluateServiceQuality(valid)).toMatchObject({ publicEligible: true, hiddenReasons: [] }));
  it("hides provider instruction and placeholder rows", () => {
    expect(evaluateServiceQuality({ ...valid, name: "1" }).publicEligible).toBe(false);
    expect(evaluateServiceQuality({ ...valid, name: "⚠️ PLEASE READ BEFORE ORDER ⚠️" }).hiddenReasons).toContain("instruction_row");
  });
  it("hides services with unsafe limits or unavailable provider funds", () => {
    expect(evaluateServiceQuality({ ...valid, min: 100, max: 10 }).publicEligible).toBe(false);
    expect(evaluateServiceQuality({ ...valid, providerFunded: false }).hiddenReasons).toContain("provider_unfunded");
  });
  it("cleans provider category separators without inventing a category", () => {
    expect(normalizeServiceCategory("---------------- FACEBOOK SERIVCES AREA ----------------")).toBe("Facebook Services Area");
    expect(normalizeServiceCategory("----")).toBe("Other services");
  });
});

describe("normalizePublicServiceName", () => {
  it("removes provider formatting and unsupported claims", () => {
    expect(normalizePublicServiceName("[ Auto ⚙ ] Telegram Post Views [ Max 50K ] | Instant Start | Future 10 Posts", "Telegram Services"))
      .toBe("Telegram Future Post Views — 10 Posts");
    expect(normalizePublicServiceName("INSTAGRAM FOLLOWERS | HQ | SUPERFAST | NONDROP 🔥🔥", "Instagram"))
      .toBe("Instagram Followers");
  });

  it("does not invent a quality promise", () => {
    const name = normalizePublicServiceName("YouTube Subscribers | Guaranteed | Real", "YouTube");
    expect(name).toBe("YouTube Subscribers");
    expect(name.toLocaleLowerCase()).not.toMatch(/guaranteed|real|organic|safe/);
  });
});
