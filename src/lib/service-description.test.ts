import { describe, expect, it } from "vitest";
import { buildPublicServiceDetails, containsPrivateProviderLeak, sanitizePublicServiceDescription, type PublicServiceDescriptionInput } from "./service-description";

const service: PublicServiceDescriptionInput = { serviceId: "nitro_123", publicId: "SB-0123456789ABCDEF", name: "Telegram Positive Reactions 👍 ❤️ 🔥", category: "Telegram", type: "Default", min: 10, max: 10_000, refill: true, cancel: false, semantics: { platform: "Telegram", kind: "Reactions", variant: "Positive", linkType: "Telegram post URL", reactionPolarity: "Positive", reactionEmojis: ["👍", "❤️", "🔥"] } };

describe("public service descriptions", () => {
  it("preserves factual provider detail while removing private provider material", () => {
    const raw = '<p>Telegram Positive Reaction 👍❤️🔥 | Start 0-1H | Speed 20K/day | 30 Days Refill | Link must be public | Followspanel service ID: 1234</p><script>alert(1)</script> Provider price: NGN 2.00 https://followspanel.com/api/v2';
    const result = sanitizePublicServiceDescription(raw);
    expect(result).toContain("Positive Reaction"); expect(result).toContain("Start 0-1H"); expect(result).toContain("Speed 20K/day"); expect(result).toContain("30 Days Refill"); expect(result).toContain("Link must be public");
    expect(result).not.toMatch(/followspanel|1234|provider price|https|script|alert/i);
    expect(containsPrivateProviderLeak(result)).toBe(false);
  });

  it("uses real provider text as full description and semantic text only as preview", () => {
    const result = buildPublicServiceDetails({ ...service, providerDescription: "Start: 0–1 hour.\nSpeed: up to 20,000 per day.\nThe Telegram post must be public." });
    expect(result.descriptionSource).toBe("provider"); expect(result.fullDescription).toContain("20,000"); expect(result.shortDescription).not.toBe(result.fullDescription);
  });

  it("marks missing provider text as an explicit generated fallback", () => {
    const result = buildPublicServiceDetails({ ...service, providerDescription: "" });
    expect(result.descriptionSource).toBe("generated_fallback"); expect(result.fullDescription).toBe(result.shortDescription); expect(result.fullDescription).not.toBe("");
  });

  it("caps sanitized descriptions at 5,000 characters", () => expect(sanitizePublicServiceDescription(`Useful details ${"x".repeat(6_000)}`).length).toBeLessThanOrEqual(5_000));
  it("decodes entities and strips HTML without leaving literal amp entities", () => expect(sanitizePublicServiceDescription("<b>Likes &amp; Views</b><br>Public post")).toBe("Likes & Views\nPublic post"));
});
