import { describe, expect, it } from "vitest";
import { configuredGrossMarginBps, decimalToMinor, grossMarginBps, markupBps, sellingPriceForGrossMarginMinor, serviceCostMinor } from "./money";
describe("money", () => {
  it.each([[100000n, 166667n], [25000n, 41667n], [1n, 2n], [0n, 0n]])("prices %s minor units for a 40%% gross margin", (cost, expected) => expect(sellingPriceForGrossMarginMinor(cost)).toBe(expected));
  it("achieves approximately a 40% gross margin after safe rounding", () => { const price = sellingPriceForGrossMarginMinor(100000n); expect(grossMarginBps(100000n, price)).toBe(4000n); expect(markupBps(100000n, price)).toBe(6666n); });
  it("prices quantity without floats", () => expect(serviceCostMinor(1000n, 1500n)).toBe(1500n));
  it("parses provider decimals without floating point", () => expect(decimalToMinor("10.005")).toBe(1001n));
  it("reads the configured gross margin without floating point", () => expect(configuredGrossMarginBps("0.40")).toBe(4000n));
  it("rejects invalid margin", () => { expect(() => sellingPriceForGrossMarginMinor(100n, 10000n)).toThrow(); expect(() => configuredGrossMarginBps("40%")).toThrow(); });
});
