export const ANALYTICS_QUALITY_STATES = [
  "EXACT",
  "EXACT_CACHED",
  "ESTIMATED",
  "PARTIAL",
  "STALE",
  "UNAVAILABLE",
] as const;

export type AnalyticsQualityState = (typeof ANALYTICS_QUALITY_STATES)[number];

export type MetricDefinition = {
  label: string;
  definition: string;
  authoritativeSource: string;
  defaultQuality: AnalyticsQualityState;
  freshness: string;
};

export const metricRegistry = {
  totalCustomers: {
    label: "Total customers",
    definition: "Firebase Authentication users excluding administrator accounts.",
    authoritativeSource: "Firebase Authentication reconciliation",
    defaultQuality: "EXACT_CACHED",
    freshness: "Event-driven; controlled reconciliation",
  },
  totalOrders: {
    label: "Total orders",
    definition: "All authoritative order documents.",
    authoritativeSource: "orders.count()",
    defaultQuality: "EXACT_CACHED",
    freshness: "Event-driven; controlled reconciliation",
  },
  activeServices: {
    label: "Active services",
    definition: "Current public, order-eligible, deduplicated catalogue services.",
    authoritativeSource: "Published public catalogue snapshots",
    defaultQuality: "EXACT_CACHED",
    freshness: "Latest successful catalogue synchronization",
  },
  ordersRequiringAttention: {
    label: "Orders requiring attention",
    definition: "Orders in an explicit administrator-action state, not all active provider orders.",
    authoritativeSource: "orders status aggregate",
    defaultQuality: "EXACT",
    freshness: "Current request",
  },
  walletLiability: {
    label: "Current NGN wallet liability",
    definition: "Total unused NGN customer wallet funds currently owed to customers.",
    authoritativeSource: "NGN wallets available balance sum",
    defaultQuality: "EXACT_CACHED",
    freshness: "Event-driven; controlled reconciliation",
  },
  verifiedDeposits: {
    label: "Verified customer deposits",
    definition: "Successfully verified customer wallet funding. Not revenue.",
    authoritativeSource: "Posted NGN walletTransactions with type deposit",
    defaultQuality: "EXACT_CACHED",
    freshness: "Event-driven; controlled reconciliation",
  },
  orderValue: {
    label: "Order value",
    definition: "Customer order charges before refunds.",
    authoritativeSource: "orders customerPriceMinor",
    defaultQuality: "EXACT_CACHED",
    freshness: "Event-driven; controlled reconciliation",
  },
  capitalDeployed: {
    label: "Capital deployed",
    definition: "Provider cost actually incurred on provider-accepted orders.",
    authoritativeSource: "orders providerCostIncurredMinor where providerAccepted",
    defaultQuality: "EXACT_CACHED",
    freshness: "Event-driven; controlled reconciliation",
  },
  supportTotals: {
    label: "Support totals",
    definition: "Counts across all support tickets; the visible conversation list remains bounded.",
    authoritativeSource: "supportTickets count aggregates",
    defaultQuality: "EXACT",
    freshness: "Current request",
  },
  cryptoTotals: {
    label: "Crypto payment totals",
    definition: "Counts across all crypto deposits; the visible payment list remains bounded.",
    authoritativeSource: "cryptoDeposits count aggregates",
    defaultQuality: "EXACT",
    freshness: "Current request",
  },
  marketingTotals: {
    label: "Marketing audiences",
    definition: "Authoritative segment counts. Segment membership can overlap.",
    authoritativeSource: "marketingProfiles count aggregates",
    defaultQuality: "EXACT_CACHED",
    freshness: "Updated within five minutes",
  },
} satisfies Record<string, MetricDefinition>;
