import { describe, expect, it } from "vitest";
import { calculateCryptoQuote } from "./crypto";

describe("crypto quote", () => {
  it("uses the conservative NGN rate and adds two percent", () => {
    const quote = calculateCryptoQuote({ requestedNgnMinor: 110_000, marketUsdNgn: 1_300, btcUsd: 100_000, network: "usdt_trc20", bufferNgn: 200, feeBps: 200 });
    expect(quote.appliedUsdNgn).toBe(1_100);
    expect(quote.expectedAssetAmount).toBeCloseTo(1.02);
  });
  it("converts BTC using its current USD price", () => {
    const quote = calculateCryptoQuote({ requestedNgnMinor: 110_000, marketUsdNgn: 1_300, btcUsd: 100_000, network: "btc", bufferNgn: 200, feeBps: 200 });
    expect(quote.expectedAssetAmount).toBeCloseTo(0.0000102);
  });
});
