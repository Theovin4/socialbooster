export type PlatformHub = {
  name: string;
  slug: string;
  overview: string;
  limitations: string;
  categories: string[];
  guides: Array<{ slug: string; label: string }>;
};

export const platformHubs: Record<string, PlatformHub> = {
  instagram: {
    name: "Instagram",
    slug: "instagram",
    overview: "Compare Instagram support options for creators, businesses and agencies. Use the catalogue to review current order limits, pricing and refill availability before choosing a service.",
    limitations: "Delivery time and final results vary by service and platform conditions. Services do not guarantee sales, reach, account safety or permanent retention. Never share a password.",
    categories: ["Followers", "Likes", "Views", "Comments"],
    guides: [{ slug: "instagram-marketing-nigeria", label: "Instagram marketing in Nigeria" }, { slug: "instagram-reels-strategy-nigeria", label: "Instagram Reels strategy" }, { slug: "instagram-business-profile-optimization", label: "Optimise an Instagram business profile" }],
  },
  tiktok: {
    name: "TikTok",
    slug: "tiktok",
    overview: "Explore TikTok service categories with transparent order ranges and current catalogue pricing for eligible customers across Nigeria and Africa.",
    limitations: "Platform algorithms and audience behaviour remain outside Social Booster's control. Select the correct public link, follow each service requirement and do not place overlapping orders.",
    categories: ["Followers", "Likes", "Views", "Shares"],
    guides: [{ slug: "tiktok-growth-nigeria", label: "TikTok growth strategy" }, { slug: "tiktok-content-ideas-nigeria", label: "TikTok content ideas" }, { slug: "tiktok-analytics-guide", label: "TikTok analytics guide" }],
  },
  facebook: {
    name: "Facebook",
    slug: "facebook",
    overview: "Review Facebook page and content services in one place, with current price examples, quantity limits and available order support.",
    limitations: "Use a public page, profile or post URL as specified. Eligibility, delivery and retention depend on the selected service and Facebook's current platform conditions.",
    categories: ["Page followers", "Page likes", "Post engagement", "Video views"],
    guides: [{ slug: "facebook-marketing-nigeria", label: "Facebook marketing in Nigeria" }, { slug: "facebook-page-optimization-nigeria", label: "Optimise a Facebook Page" }, { slug: "facebook-ads-budget-nigeria", label: "Plan a Facebook ads budget" }],
  },
  youtube: {
    name: "YouTube",
    slug: "youtube",
    overview: "Compare YouTube channel and video service options using current catalogue prices, supported quantities and service-specific order notes.",
    limitations: "A service cannot guarantee monetisation, rankings, revenue or permanent audience retention. Use the exact channel or video URL requested and follow YouTube policies.",
    categories: ["Subscribers", "Views", "Likes", "Watch activity"],
    guides: [{ slug: "youtube-marketing-nigeria", label: "YouTube marketing strategy" }, { slug: "youtube-seo-nigeria", label: "YouTube SEO" }, { slug: "youtube-thumbnail-tips", label: "YouTube thumbnail guidance" }],
  },
  telegram: {
    name: "Telegram",
    slug: "telegram",
    overview: "Browse Telegram channel and post service categories with clear catalogue pricing, supported quantities and current availability.",
    limitations: "Public and private link requirements differ by service. Read the service instructions before ordering; delivery characteristics and retention vary.",
    categories: ["Channel members", "Post views", "Reactions", "Shares"],
    guides: [{ slug: "social-media-marketing-nigeria", label: "Social media marketing in Nigeria" }, { slug: "brand-community-management", label: "Brand community management" }, { slug: "social-media-analytics-nigeria", label: "Social media analytics" }],
  },
};
