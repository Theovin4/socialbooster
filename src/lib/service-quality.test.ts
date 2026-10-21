import { describe, expect, it } from "vitest";
import { assertServiceOrderEligible, choosePreferredDuplicateServices, compactPublicServiceSemantics, complianceStatusForService, evaluateServiceQuality, expandPublicServiceSemantics, extractPublicServiceSemantics, matchesServiceSearch, normalizePublicServiceName, normalizeServiceCategory, priceStatusForService, publicServiceDescription, rankFeaturedServices, sanitizePublicCatalogCandidate, ServiceUnavailableError } from "./service-quality";

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
    expect(priceStatusForService(1_000n, 55_075_853_616_67n)).toBe("PRICE_ANOMALY");
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

  it("preserves reaction polarity and explicit emoji sets", () => {
    expect(normalizePublicServiceName("Telegram Positive Reactions", "Telegram")).toBe("Telegram Positive Reactions");
    expect(normalizePublicServiceName("Telegram Negative Reactions", "Telegram")).toBe("Telegram Negative Reactions");
    expect(normalizePublicServiceName("Telegram Mixed Reactions", "Telegram")).toBe("Telegram Mixed Reactions");
    expect(normalizePublicServiceName("Telegram Reactions 👍 ❤️ 🔥", "Telegram")).toBe("Telegram Reactions — 👍 ❤️ 🔥");
  });

  it("keeps product meaning while removing unsupported claims", () => {
    expect(normalizePublicServiceName("100% Real Guaranteed Non-Drop Telegram Positive Reactions", "Telegram")).toBe("Telegram Positive Reactions");
    expect(normalizePublicServiceName("Instagram Female Followers Nigeria", "Instagram")).toBe("Instagram Followers — Female — Nigeria");
    expect(normalizePublicServiceName("Instagram Reel Views", "Instagram")).toBe("Instagram Reel Views");
    expect(normalizePublicServiceName("Instagram Story Views", "Instagram")).toBe("Instagram Story Views");
    expect(normalizePublicServiceName("Facebook Post Reactions", "Facebook")).toBe("Facebook Post Reactions");
    expect(normalizePublicServiceName("Telegram Channel Members", "Telegram")).toBe("Telegram Channel Members");
    expect(normalizePublicServiceName("Telegram Group Members", "Telegram")).toBe("Telegram Group Members");
  });

  it("uses sanitized provider descriptions only as semantic input", () => {
    const semantics = extractPublicServiceSemantics("Telegram Reactions", "Telegram", "Followspanel API: Positive Reactions for posts. Guaranteed real. Contact support@example.test");
    expect(semantics).toMatchObject({ platform: "Telegram", kind: "Reactions", reactionPolarity: "Positive", target: "Post" });
    expect(JSON.stringify(semantics).toLocaleLowerCase()).not.toMatch(/followspanel|guaranteed|support@example/);
  });

  it("round-trips compact snapshot codes without losing meaning", () => {
    const semantics = extractPublicServiceSemantics("Telegram Positive Reactions 👍 ❤️", "Telegram");
    const compact = compactPublicServiceSemantics(semantics);
    expect(compact).toEqual({ p: "tg", k: "r", v: "p", e: "👍 ❤️" });
    expect(expandPublicServiceSemantics(compact)).toEqual(semantics);
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

  it("does not deduplicate positive, negative or mixed reaction variants", () => {
    const variants = ["Positive", "Negative", "Mixed"] as const;
    const services = variants.map((variant, index) => ({ ...base, id: String(index), name: "Telegram Reactions", category: "Telegram · Reactions", semantics: { platform: "Telegram", kind: "Reactions", variant, reactionPolarity: variant, linkType: "Post URL" }, rateMinor: 1500 }));
    expect(choosePreferredDuplicateServices(services)).toHaveLength(3);
  });

  it("does not deduplicate different reaction emoji sets", () => {
    const services = [
      { ...base, id: "thumb", name: "Telegram Reactions", category: "Telegram · Reactions", semantics: { platform: "Telegram", kind: "Reactions", reactionEmojis: ["👍"], linkType: "Post URL" }, rateMinor: 1500 },
      { ...base, id: "heart", name: "Telegram Reactions", category: "Telegram · Reactions", semantics: { platform: "Telegram", kind: "Reactions", reactionEmojis: ["❤️"], linkType: "Post URL" }, rateMinor: 1500 },
    ];
    expect(choosePreferredDuplicateServices(services)).toHaveLength(2);
  });
});

describe("customer-facing semantic copy and search", () => {
  const positive = { id: "positive", name: "Telegram Reactions — Positive", category: "Telegram · Reactions", description: "Adds positive reactions.", semantics: { platform: "Telegram", kind: "Reactions", variant: "Positive", reactionPolarity: "Positive" as const, linkType: "Post URL" } };
  const negative = { id: "negative", name: "Telegram Reactions — Negative", category: "Telegram · Reactions", description: "Adds negative reactions.", semantics: { platform: "Telegram", kind: "Reactions", variant: "Negative", reactionPolarity: "Negative" as const, linkType: "Post URL" } };

  it("finds the requested reaction variant", () => {
    expect(matchesServiceSearch(positive, "positive telegram reactions")).toBe(true);
    expect(matchesServiceSearch(positive, "negative telegram reactions")).toBe(false);
    expect(matchesServiceSearch(negative, "negative telegram reactions")).toBe(true);
  });

  it("generates factual copy with limits, refill and cancellation", () => {
    const description = publicServiceDescription({ ...positive, min: 10, max: 5_000, refill: true, cancel: false });
    expect(description).toMatch(/positive reactions.*Telegram post/i);
    expect(description).toMatch(/10 to 5,000/);
    expect(description).toMatch(/Refill support is available/);
    expect(description).toMatch(/Cancellation is not available/);
  });
});

describe("confirmed catalogue regressions", () => {
  it("rejects the Audiomack header and its multi-billion-naira price", () => {
    const quality = evaluateServiceQuality({ name: "AUDIOMACK SERVICES", category: "audiomack", min: 1, max: 1, rateMinor: 297_409_612_500_00n, sellingRateMinor: 495_682_687_500_00n, providerFunded: true });
    expect(quality).toMatchObject({ publicEligible: false, priceStatus: "PRICE_ANOMALY" });
    expect(quality.reasonCodes).toEqual(expect.arrayContaining(["NON_SERVICE_RECORD", "PRICE_ANOMALY", "UNMAPPED_CATEGORY"]));
  });

  it("rejects both confirmed extreme-price records", () => {
    expect(priceStatusForService(3_304_550_920_00n, 5_507_584_866_67n, { name: "AUDIOMACK USA SERVICES", category: "audiomack", min: 1, max: 1 })).toBe("PRICE_ANOMALY");
    expect(priceStatusForService(33_045_512_170_00n, 55_075_853_616_67n, { name: "Audiomack Plays", category: "audiomack", min: 10, max: 10_000 })).toBe("PRICE_ANOMALY");
  });

  it("does not reject a meaningful service merely because it is expensive", () => {
    expect(priceStatusForService(1_200_000_000_00n, 2_000_000_000_00n, { name: "Apple Music Plays", category: "applemusic", min: 100, max: 100_000 })).toBe("NORMAL");
  });

  it("normalizes malformed Apple Music names and raw categories", () => {
    expect(normalizePublicServiceName("Apple Music Nigerian Likes — , Nigerian", "applemusic")).toBe("Apple Music Likes — Nigeria");
    expect(normalizePublicServiceName("Apple Music Worldwide Likes — , Worldwide", "applemusic")).toBe("Apple Music Likes — Worldwide");
    expect(normalizeServiceCategory("applemusic", "Apple Music Likes")).toBe("Apple Music · Likes");
  });

  it("normalizes Audiomack and removes provider claim artifacts", () => {
    expect(normalizeServiceCategory("audiomack", "Audiomack followers")).toBe("Audiomack · Followers");
    expect(normalizePublicServiceName("Apple Music USA Plays — guarantee, 250-1K — day · 250-1K — Day M", "applemusic")).toBe("Apple Music Plays — United States");
    expect(normalizePublicServiceName("Audiomack Followers · Strat 0-30 — Minutes ⌊", "audiomack")).toBe("Audiomack Followers");
  });

  it("filters a legacy hidden snapshot row without another Firestore read", () => {
    const bad = { id: "SB-C7D93610323AB12F", name: "AUDIOMACK SERVICES", category: "audiomack", min: 1, max: 1, type: "default", refill: false, cancel: false, rateMinor: 49_568_268_750_000, featured: false, active: true };
    expect(sanitizePublicCatalogCandidate(bad)).toBeNull();
  });
});

describe("order-side eligibility", () => {
  const stored = { active: true, publicEligibility: "eligible", rawName: "Instagram Followers", rawCategoryName: "Instagram", minQuantity: 100, maxQuantity: 10_000, providerRateNgnMinor: 1000, sellingRateMinor: 1667, type: "default", refillSupported: false, cancelSupported: false, priceStatus: "NORMAL", complianceStatus: "APPROVED" };

  it("accepts an exact 40% gross-margin stored service", () => expect(assertServiceOrderEligible(stored).publicEligible).toBe(true));

  it("rejects a hidden direct-ID order before a wallet mutation", () => {
    let walletMinor = 25_000;
    expect(() => {
      assertServiceOrderEligible({ ...stored, active: false, publicEligibility: "hidden" });
      walletMinor -= 1_667;
    }).toThrow(ServiceUnavailableError);
    expect(walletMinor).toBe(25_000);
  });

  it("rejects an anomalous service even when stale stored flags say normal", () => {
    expect(() => assertServiceOrderEligible({ ...stored, rawName: "AUDIOMACK SERVICES", rawCategoryName: "audiomack", minQuantity: 1, maxQuantity: 1, providerRateNgnMinor: 29_740_961_250_000, sellingRateMinor: 49_568_268_750_000 })).toThrow("temporarily unavailable");
  });
});
