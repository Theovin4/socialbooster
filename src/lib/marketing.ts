export type MarketingStatus = "active" | "unsubscribed" | "suppressed";
export type EmailHealth = "active" | "bounced" | "complained" | "suppressed";
export type CampaignStatus = "draft" | "scheduled" | "cancelled" | "sent";

export const marketingTopics = [
  { id: "product_updates", label: "Product updates", description: "Important improvements to Social Booster features and supported services." },
  { id: "offers", label: "Offers and promotions", description: "Optional promotions and carefully reviewed commercial offers." },
  { id: "guides", label: "Marketing guides", description: "Practical educational content for planning and measuring campaigns." },
  { id: "reseller_api", label: "Reseller and API updates", description: "API documentation, integration and reseller workflow updates." },
] as const;

export type MarketingTopicId = (typeof marketingTopics)[number]["id"];

export const MARKETING_PROFILE_COLLECTION = "marketingProfiles";
export const MARKETING_CAMPAIGN_COLLECTION = "marketingCampaigns";
export const MARKETING_STATS_DOCUMENT = "marketingStats/totals";
export const VIP_LIFETIME_VALUE_MINOR = 500_000;

export const marketingSegments = [
  { id: "eligible", label: "All marketing eligible", description: "Explicitly subscribed customers with a healthy email address." },
  { id: "active", label: "Active customers", description: "Eligible customers who completed an order in the last 30 days." },
  { id: "at_risk", label: "At risk", description: "Eligible customers whose last completed order was 31–60 days ago." },
  { id: "inactive", label: "Inactive", description: "Eligible customers whose last completed order was 61–90 days ago." },
  { id: "dormant", label: "Dormant", description: "Eligible customers whose last completed order was more than 90 days ago." },
  { id: "funded_no_order", label: "Funded, no completed order", description: "Eligible customers with a funded wallet and no completed order." },
  { id: "repeat", label: "Repeat customers", description: "Eligible customers with at least two completed orders." },
  { id: "vip", label: "VIP", description: "Eligible customers whose completed order value meets the configured VIP threshold." },
  { id: "reseller_api", label: "Reseller or API", description: "Eligible customers who use an API key or have reseller status." },
  { id: "crypto", label: "Crypto customers", description: "Eligible customers who previously funded by cryptocurrency." },
] as const;

export type MarketingSegmentId = (typeof marketingSegments)[number]["id"];

export const marketingTemplates = [
  { id: "announcement", name: "Announcement", subject: "An update from Social Booster", preheader: "A concise update about your Social Booster account and services.", heading: "A useful update", body: "We have an update that may help you plan your next campaign.", ctaText: "Open Social Booster", ctaUrl: "/dashboard" },
  { id: "welcome", name: "Welcome", subject: "Welcome to Social Booster", preheader: "Your account is ready for planning and tracking campaigns.", heading: "Welcome to Social Booster", body: "Your account gives you one place to review services, fund your wallet and follow order progress. Start by checking the available options and their requirements.", ctaText: "Open your dashboard", ctaUrl: "/dashboard" },
  { id: "first_order", name: "First-order guide", subject: "How to place your first order", preheader: "A short guide to choosing a service and submitting the correct link.", heading: "Place your first order with confidence", body: "Choose the platform and service that match your goal, read the service description carefully, then submit the exact public link requested. You can review progress from your dashboard.", ctaText: "Start a new order", ctaUrl: "/dashboard/new-order" },
  { id: "funded_no_order", name: "Funded wallet reminder", subject: "Your wallet is ready when you are", preheader: "Review services and place an order when it suits you.", heading: "Your wallet is ready", body: "Your Social Booster wallet is funded. Review the available services, limits and current pricing before you place an order.", ctaText: "Review services", ctaUrl: "/dashboard/new-order" },
  { id: "order_planning", name: "Campaign planning", subject: "Plan your next social media campaign", preheader: "A practical checklist before placing an order.", heading: "A clearer plan leads to better decisions", body: "Confirm your objective, target platform, public link and quantity before ordering. Review the service limits and expected delivery information so the option you choose fits your campaign.", ctaText: "Review available services", ctaUrl: "/dashboard/new-order" },
  { id: "education", name: "Educational guide", subject: "A practical guide for your next campaign", preheader: "Useful guidance for planning and measuring social media activity.", heading: "Plan your next campaign with clarity", body: "Our latest guidance explains practical ways to choose a platform, set a useful objective and measure meaningful results.", ctaText: "Read the guides", ctaUrl: "/blog" },
  { id: "measurement", name: "Measurement guide", subject: "Measure what matters in your campaign", preheader: "Use clear goals and useful metrics for your next campaign.", heading: "Measure progress with purpose", body: "Choose a small set of metrics that match your campaign goal. Track them consistently and compare results over an appropriate period instead of relying on a single number.", ctaText: "Read marketing guides", ctaUrl: "/blog" },
  { id: "reactivation", name: "Reactivation", subject: "See what is available in Social Booster", preheader: "Review current services and recent platform guidance.", heading: "Ready when your next campaign is", body: "When you are planning your next campaign, you can review current services, requirements and order limits from your account before making a decision.", ctaText: "Review your account", ctaUrl: "/dashboard" },
  { id: "product_update", name: "Product update", subject: "A Social Booster product update", preheader: "A useful improvement to your account experience.", heading: "A smoother Social Booster experience", body: "We have improved part of the Social Booster experience to make account management, ordering or progress tracking clearer.", ctaText: "View the update", ctaUrl: "/dashboard" },
  { id: "service_discovery", name: "Service discovery", subject: "Find a service for your next campaign", preheader: "Browse current services by platform and campaign goal.", heading: "Explore current service options", body: "Browse the available services, compare their limits and read each description before deciding which option matches your campaign objective.", ctaText: "Browse services", ctaUrl: "/dashboard/new-order" },
  { id: "reseller", name: "Reseller and API", subject: "A more efficient workflow for repeat orders", preheader: "Use documented API tools for approved repeat workflows.", heading: "Build a more efficient workflow", body: "If you manage repeat orders, the Social Booster API can help you submit and track approved services through a documented workflow.", ctaText: "Read API documentation", ctaUrl: "/api-docs" },
  { id: "api_onboarding", name: "API onboarding", subject: "Start using the Social Booster API", preheader: "Follow the documented authentication and order workflow.", heading: "Integrate with clear documentation", body: "Create your API key from the protected dashboard, keep it private and follow the documented request, idempotency and status-checking guidance before using it in production.", ctaText: "Open API documentation", ctaUrl: "/api-docs" },
  { id: "crypto_guide", name: "Crypto payment guide", subject: "How to fund your wallet with cryptocurrency", preheader: "Review the supported networks and confirmation steps.", heading: "Use the correct network and address", body: "Choose the supported asset and network shown in your wallet, send the exact intended amount within the quote window and submit the transaction details for review.", ctaText: "Open wallet funding", ctaUrl: "/dashboard/fund-wallet" },
  { id: "security", name: "Account security", subject: "Keep your Social Booster account secure", preheader: "Simple steps that help protect your account.", heading: "Protect your account", body: "Use a unique password, keep verification links and API keys private, and contact support from your account if you notice activity you do not recognize.", ctaText: "Review your account", ctaUrl: "/dashboard" },
  { id: "support", name: "Support guidance", subject: "Get help with your Social Booster account", preheader: "Use your protected support inbox for account, payment or order questions.", heading: "Support is available from your account", body: "For faster assistance, open a support request from your dashboard and include the relevant order or payment reference without sharing passwords, PINs or one-time codes.", ctaText: "Open support", ctaUrl: "/dashboard/support" },
  { id: "responsible_use", name: "Responsible use", subject: "Use Social Booster services responsibly", preheader: "Review service requirements and platform policies before ordering.", heading: "Responsible campaign planning", body: "Use services only for lawful campaigns you control, review platform rules and service descriptions, and never submit content or links that violate another person's rights.", ctaText: "Review acceptable use", ctaUrl: "/acceptable-use" },
] as const;

export type MarketingTemplateId = (typeof marketingTemplates)[number]["id"];

export function isMarketingSegment(value: string): value is MarketingSegmentId {
  return marketingSegments.some((segment) => segment.id === value);
}

export function isMarketingTemplate(value: string): value is MarketingTemplateId {
  return marketingTemplates.some((template) => template.id === value);
}

export function isMarketingTopic(value: string): value is MarketingTopicId {
  return marketingTopics.some((topic) => topic.id === value);
}

export function marketingSegmentMemberships(profile: Record<string, unknown>, now = new Date()): MarketingSegmentId[] {
  if (!canReceiveMarketing(profile)) return [];
  const memberships = new Set<MarketingSegmentId>(["eligible"]);
  const completed = Number(profile.completedOrderCount || 0);
  const lastOrderAt = (profile.lastOrderAt as { toDate?: () => Date } | undefined)?.toDate?.() ??
    (profile.lastOrderAt instanceof Date ? profile.lastOrderAt : null);
  const daysSinceOrder = lastOrderAt ? Math.floor((now.getTime() - lastOrderAt.getTime()) / 86_400_000) : null;
  if (daysSinceOrder !== null && daysSinceOrder <= 30) memberships.add("active");
  if (daysSinceOrder !== null && daysSinceOrder >= 31 && daysSinceOrder <= 60) memberships.add("at_risk");
  if (daysSinceOrder !== null && daysSinceOrder >= 61 && daysSinceOrder <= 90) memberships.add("inactive");
  if (daysSinceOrder !== null && daysSinceOrder > 90) memberships.add("dormant");
  if (profile.walletFunded === true && completed === 0) memberships.add("funded_no_order");
  if (completed >= 2) memberships.add("repeat");
  if (Number(profile.lifetimeOrderValueMinor || 0) >= VIP_LIFETIME_VALUE_MINOR) memberships.add("vip");
  if (profile.resellerOrApi === true) memberships.add("reseller_api");
  if (profile.hasUsedCrypto === true) memberships.add("crypto");
  return [...memberships];
}

export function marketingSendingEnabled() {
  return process.env.MARKETING_EMAIL_ENABLED === "true";
}

export function canReceiveMarketing(profile: Record<string, unknown> | null | undefined) {
  return Boolean(profile?.marketingConsent === true && profile?.marketingEligible === true && profile?.marketingStatus === "active" && profile?.emailStatus === "active");
}

export function campaignCanSend(input: { status: CampaignStatus; recipientCount: number; sendingEnabled: boolean }) {
  return input.status === "scheduled" && input.recipientCount > 0 && input.sendingEnabled;
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}
