import { serviceCostMinor, sellingPriceMinor } from "./money";

export const SUPPORTED_CURRENCIES = ["USD", "GBP", "EUR", "NGN", "CAD", "AUD"] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];
export type ExchangeRate = { base: "USD"; quote: SupportedCurrency; rateMicros: bigint; capturedAt: string };

const RATE_SCALE = 1_000_000n;

export function convertMinor(amountMinor: bigint, rateMicros: bigint) {
  if (amountMinor < 0n || rateMicros <= 0n) throw new Error("Invalid currency conversion");
  return (amountMinor * rateMicros + RATE_SCALE - 1n) / RATE_SCALE;
}

export function quoteService(input: { ratePerThousandMinor: bigint; quantity: bigint; marginBps?: bigint; exchangeRateMicros?: bigint }) {
  const providerCostMinor = serviceCostMinor(input.ratePerThousandMinor, input.quantity);
  const usdSellingPriceMinor = sellingPriceMinor(providerCostMinor, input.marginBps);
  const customerPriceMinor = input.exchangeRateMicros ? convertMinor(usdSellingPriceMinor, input.exchangeRateMicros) : usdSellingPriceMinor;
  return { providerCostMinor, usdSellingPriceMinor, customerPriceMinor };
}
