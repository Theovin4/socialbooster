import { serviceCostMinor, sellingPriceMinor } from "./money";

export const SUPPORTED_CURRENCIES = ["USD", "GBP", "EUR", "NGN", "CAD", "AUD"] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];
export type ExchangeRate = { base: "USD"; quote: SupportedCurrency; rateMicros: bigint; capturedAt: string };

const RATE_SCALE = 1_000_000n;

export function configuredUsdToNgnRateMicros(value = process.env.USD_TO_NGN_RATE || "1600") {
  value = value.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(value)) throw new Error("USD_TO_NGN_RATE must be a positive decimal");
  const [whole, fraction = ""] = value.split(".");
  const rate = BigInt(whole) * RATE_SCALE + BigInt((fraction + "000000").slice(0, 6));
  if (rate <= 0n) throw new Error("USD_TO_NGN_RATE must be positive");
  return rate;
}

export function convertMinor(amountMinor: bigint, rateMicros: bigint) {
  if (amountMinor < 0n || rateMicros <= 0n) throw new Error("Invalid currency conversion");
  return (amountMinor * rateMicros + RATE_SCALE - 1n) / RATE_SCALE;
}

export function quoteService(input: { ratePerThousandMinor: bigint; quantity: bigint; marginBps?: bigint; exchangeRateMicros?: bigint }) {
  const providerCostMinor = serviceCostMinor(input.ratePerThousandMinor, input.quantity);
  const convertedProviderCostMinor = input.exchangeRateMicros ? convertMinor(providerCostMinor, input.exchangeRateMicros) : providerCostMinor;
  const customerPriceMinor = sellingPriceMinor(convertedProviderCostMinor, input.marginBps);
  return { providerCostMinor, convertedProviderCostMinor, customerPriceMinor };
}
