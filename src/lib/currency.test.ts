import { describe, expect, it } from "vitest";
import { convertMinor, quoteService } from "./currency";

describe("currency-safe quotes", () => {
  it("converts using integer micros and rounds up", () => expect(convertMinor(1667n, 1_500_000n)).toBe(2501n));
  it("preserves exact order-time cost and true 40% margin", () => expect(quoteService({ ratePerThousandMinor: 1000n, quantity: 1000n })).toEqual({ providerCostMinor: 1000n, usdSellingPriceMinor: 1667n, customerPriceMinor: 1667n }));
  it("rejects invalid exchange rates", () => expect(() => convertMinor(100n, 0n)).toThrow());
});
