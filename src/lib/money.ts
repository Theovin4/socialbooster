export const DEFAULT_MARGIN_BPS=4000n;const BPS=10000n;
export function sellingPriceMinor(providerCostMinor:bigint,marginBps=DEFAULT_MARGIN_BPS){if(providerCostMinor<0n||marginBps<0n||marginBps>=BPS)throw new Error("Invalid money or margin");const divisor=BPS-marginBps;return(providerCostMinor*BPS+divisor-1n)/divisor}
export function serviceCostMinor(ratePerThousandMinor:bigint,quantity:bigint){if(ratePerThousandMinor<0n||quantity<0n)throw new Error("Invalid rate or quantity");return(ratePerThousandMinor*quantity+999n)/1000n}
export function formatMoney(minor:bigint,currency="USD"){return new Intl.NumberFormat("en",{style:"currency",currency}).format(Number(minor)/100)}
