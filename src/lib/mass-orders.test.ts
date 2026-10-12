import { describe, expect, it } from "vitest";
import { parseMassOrderLines } from "./mass-orders";

describe("mass order preflight", () => {
  it("validates every row before submission", () => {
    expect(parseMassOrderLines("svc_1 | https://example.com/post | 100\nsvc_2 | https://example.com/profile | 200")).toHaveLength(2);
    expect(() => parseMassOrderLines("svc_1 | not-a-url | 100")).toThrow(/Line 1/);
    expect(() => parseMassOrderLines("svc_1 | https://example.com | 0")).toThrow(/Line 1/);
  });
  it("bounds a batch to protect wallet and provider operations", () => {
    expect(() => parseMassOrderLines(Array.from({ length: 11 }, (_, index) => `svc_${index} | https://example.com/${index} | 100`).join("\n"))).toThrow(/between 1 and 10/);
  });
});
