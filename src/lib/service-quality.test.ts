import { describe, expect, it } from "vitest";
import { choosePreferredDuplicateServices, complianceStatusForService, evaluateServiceQuality, normalizePublicServiceName, normalizeServiceCategory, priceStatusForService, rankFeaturedServices } from "./service-quality";

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
    expect(normalizeServiceCategory("---------------- FACEBOOK SERIVCES AREA ----------------", "Facebook page followers")).toBe("Facebook · Followers");
    expect(normalizeServiceCategory("Telegram services", "Telegram channel members")).toBe("Telegram · Members");
    expect(normalizeServiceCategory("Spotify", "Spotify track plays")).toBe("Music · Plays");
    expect(normalizeServiceCategory("----")).toBe("INTERNAL_REVIEW");
  });

  it("holds unknown, anomalous and unsafe services out of the public catalogue", () => {
    expect(evaluateServiceQuality({ ...valid, name: "Mystery package", category: "Other" }).hiddenReasons).toContain("unknown_public_category");
    expect(priceStatusForService(1000n, 200_000_000_00n)).toBe("PRICE_ANOMALY");
    expect(complianceStatusForService("Mass account reporting", "Instagram")).toBe("PROHIBITED");
    expect(evaluateServiceQuality({ ...valid, name: "Fake app reviews", sellingRateMinor: 2000n }).publicEligible).toBe(false);
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

  it("redacts connection brands, noisy claims and duplicated words", () => {
    const name = normalizePublicServiceName("Followspanel TOP SERVICE Instagram Instagram Followers,,, Lifetime Guarantee", "Instagram followers");
    expect(name).toBe("Instagram Followers");
    expect(name.toLocaleLowerCase()).not.toMatch(/followspanel|top service|guarantee/);
  });
});

describe("public catalogue curation", () => {
  const base = { name: "Instagram Followers", category: "Instagram · Followers", min: 100, max: 10_000, type: "default", refill: true, cancel: false, featured: false };
  it("keeps the deterministic lower-price representative without deleting source records", () => {
    const services = [{ ...base, id: "b", rateMinor: 2000 }, { ...base, id: "a", rateMinor: 1500 }];
    expect(choosePreferredDuplicateServices(services).map((item) => item.id)).toEqual(["a"]);
    expect(services).toHaveLength(2);
  });
  it("ranks explicit featured services before ordinary provider order", () => {
    const services = [{ ...base, id: "a", rateMinor: 1000 }, { ...base, id: "b", rateMinor: 2000, featured: true, name: "Instagram Likes", category: "Instagram · Likes" }];
    expect(rankFeaturedServices(services)[0].id).toBe("b");
  });
});
