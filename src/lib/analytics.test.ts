import { describe, expect, it } from "vitest";
import { sanitizeAnalyticsParameters } from "./analytics";

describe("analytics data safety", () => {
  it("keeps commercial metrics and strips personal or credential data", () => {
    expect(sanitizeAnalyticsParameters({ currency: "NGN", value: 1200, email: "customer@example.com", target_url: "https://social.example/post", nested: { item_name: "Instagram Followers", apiKey: "sb_live_secret" } })).toEqual({ currency: "NGN", value: 1200, nested: { item_name: "Instagram Followers" } });
  });
});
