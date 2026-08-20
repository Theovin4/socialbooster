import { describe, expect, it } from "vitest";
import { configuredUsdToNgnRateMicros, convertMinor, quoteService } from "./currency";

describe("currency-safe quotes", () => {
  it("converts USD cents to NGN kobo using integer micros", () => expect(convertMinor(100n, configuredUsdToNgnRateMicros("1500"))).toBe(150000n));
  it("preserves cost and applies margin after conversion", () => expect(quoteService({ ratePerThousandMinor: 1000n, quantity: 1000n, exchangeRateMicros: configuredUsdToNgnRateMicros("1500") })).toEqual({ providerCostMinor: 1000n, convertedProviderCostMinor: 1500000n, customerPriceMinor: 2500000n }));
  it("rejects invalid exchange rates", () => expect(() => convertMinor(100n, 0n)).toThrow());
});
