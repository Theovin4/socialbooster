import { describe, expect, it } from "vitest";
import { configuredUsdToNgnRateMicros, convertMinor, quoteService, serviceSellingRateNgnMinor } from "./currency";

describe("currency-safe quotes", () => {
  it("converts USD cents to NGN kobo using integer micros", () => expect(convertMinor(100n, configuredUsdToNgnRateMicros("1500"))).toBe(150000n));
  it("preserves cost and applies a 40% markup after conversion", () => expect(quoteService({ ratePerThousandMinor: 1000n, quantity: 1000n, exchangeRateMicros: configuredUsdToNgnRateMicros("1500") })).toEqual({ providerCostMinor: 1000n, convertedProviderCostMinor: 1500000n, customerPriceMinor: 2100000n }));
  it("rejects invalid exchange rates", () => expect(() => convertMinor(100n, 0n)).toThrow());
  it("recalculates legacy service prices using 40% markup", () => expect(serviceSellingRateNgnMinor({ providerRateMinor: 100, sellingRateMinor: 266667, pricingModel: "legacy" })).toBe(224000n));
});
