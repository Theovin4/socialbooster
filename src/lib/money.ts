export const DEFAULT_GROSS_MARGIN_BPS = 4000n;
const BPS = 10000n;

/**
 * Reads the target gross margin. DEFAULT_MARKUP remains a temporary fallback
 * for existing deployments, but its decimal value is interpreted as a gross
 * margin so one business rule is used everywhere.
 */
export function configuredGrossMarginBps(
  value = process.env.DEFAULT_GROSS_MARGIN || process.env.DEFAULT_MARKUP || "0.40",
) {
  if (!/^0\.\d{1,4}$/.test(value)) {
    throw new Error("DEFAULT_GROSS_MARGIN must be a decimal from 0.0001 to 0.9999");
  }
  const bps = BigInt(value.slice(2).padEnd(4, "0"));
  if (bps <= 0n || bps >= BPS) throw new Error("Invalid configured gross margin");
  return bps;
}

/** Price = cost / (1 - target gross margin), rounded up to the nearest minor unit. */
export function sellingPriceForGrossMarginMinor(
  providerCostMinor: bigint,
  grossMarginTargetBps = DEFAULT_GROSS_MARGIN_BPS,
) {
  if (providerCostMinor < 0n || grossMarginTargetBps < 0n || grossMarginTargetBps >= BPS) {
    throw new Error("Invalid money or gross margin");
  }
  if (providerCostMinor === 0n) return 0n;
  const divisor = BPS - grossMarginTargetBps;
  return (providerCostMinor * BPS + divisor - 1n) / divisor;
}

export function grossMarginBps(providerCostMinor: bigint, sellingPriceMinor: bigint) {
  if (providerCostMinor < 0n || sellingPriceMinor < providerCostMinor || sellingPriceMinor <= 0n) return 0n;
  return ((sellingPriceMinor - providerCostMinor) * BPS) / sellingPriceMinor;
}

export function markupBps(providerCostMinor: bigint, sellingPriceMinor: bigint) {
  if (providerCostMinor <= 0n || sellingPriceMinor < providerCostMinor) return 0n;
  return ((sellingPriceMinor - providerCostMinor) * BPS) / providerCostMinor;
}

export function serviceCostMinor(ratePerThousandMinor: bigint, quantity: bigint) {
  if (ratePerThousandMinor < 0n || quantity < 0n) throw new Error("Invalid rate or quantity");
  return (ratePerThousandMinor * quantity + 999n) / 1000n;
}

export function formatMoney(minor: bigint, currency = "USD") {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(minor) / 100);
}

export function decimalToMinor(value: string) {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Invalid decimal amount");
  const [whole, fraction = ""] = value.split(".");
  const padded = (fraction + "00").slice(0, 2);
  const remainder = fraction.slice(2);
  let minor = BigInt(whole) * 100n + BigInt(padded);
  if (remainder && Number(remainder[0]) >= 5) minor += 1n;
  return minor;
}
