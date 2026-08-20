import { describe, expect, it } from "vitest";
import { configuredMarginBps, decimalToMinor, sellingPriceMinor, serviceCostMinor } from "./money";
describe("money", () => {
  it("adds an exact 40% markup", () => expect(sellingPriceMinor(1000n)).toBe(1400n));
  it("rounds markup up safely", () => expect(sellingPriceMinor(1n)).toBe(2n));
  it("prices quantity without floats", () => expect(serviceCostMinor(1000n, 1500n)).toBe(1500n));
  it("parses provider decimals without floating point", () => expect(decimalToMinor("10.005")).toBe(1001n));
  it("reads the configured markup without floating point", () => expect(configuredMarginBps("0.40")).toBe(4000n));
  it("rejects invalid markup", () => { expect(() => sellingPriceMinor(100n, 10000n)).toThrow(); expect(() => configuredMarginBps("40%")).toThrow(); });
});
