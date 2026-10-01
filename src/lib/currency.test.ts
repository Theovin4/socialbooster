import { describe, expect, it } from "vitest";
import { configuredUsdToNgnRateMicros, convertMinor, quoteService, serviceSellingRateNgnMinor } from "./currency";

describe("currency-safe quotes", () => {
  it("converts USD cents to NGN kobo using integer micros", () => expect(convertMinor(100n, configuredUsdToNgnRateMicros("1500"))).toBe(150000n));
  it("preserves cost and applies a 40% gross margin after conversion", () => expect(quoteService({ ratePerThousandMinor: 1000n, quantity: 1000n, exchangeRateMicros: configuredUsdToNgnRateMicros("1500") })).toEqual({ providerCostMinor: 1000n, convertedProviderCostMinor: 1500000n, customerPriceMinor: 2500000n }));
  it("rejects invalid exchange rates", () => expect(() => convertMinor(100n, 0n)).toThrow());
  it("treats provider service rates as NGN and applies the margin", () => expect(serviceSellingRateNgnMinor({ providerRateMinor: 166400, sellingRateMinor: 266667, pricingModel: "legacy" })).toBe(277334n));
  it("ignores a stale stored customer price", () => expect(serviceSellingRateNgnMinor({ providerRateMinor: 10000, sellingRateMinor: 999999999, pricingModel: "ngn_markup_v1" })).toBe(16667n));
});
