export type PriceStatus = "NORMAL" | "PRICE_REVIEW" | "PRICE_ANOMALY";
export type ComplianceStatus = "APPROVED" | "REVIEW_REQUIRED" | "PUBLIC_HIDDEN" | "PROHIBITED";

export type ServiceQualityInput = {
  name: string;
  category: string;
  min: number;
  max: number;
  rateMinor: bigint;
  sellingRateMinor?: bigint;
  providerFunded: boolean;
  type?: string;
  refill?: boolean;
  cancel?: boolean;
};

export type ServiceQuality = {
  publicEligible: boolean;
  publicName: string;
  normalizedCategory: string;
  hiddenReasons: string[];
  priceStatus: PriceStatus;
  complianceStatus: ComplianceStatus;
  duplicateGroupKey: string;
};

const INTERNAL_REVIEW = "INTERNAL_REVIEW";

function titleCase(value: string) {
  return value.toLocaleLowerCase("en").replace(/(^|[\s/|()[\]-])\p{L}/gu, (match) => match.toLocaleUpperCase("en"));
}

function dedupeWords(value: string) {
  const tokens = value.split(/\s+/).filter(Boolean);
  return tokens.filter((token, index) => index === 0 || token.toLocaleLowerCase("en") !== tokens[index - 1].toLocaleLowerCase("en")).join(" ");
}

function cleanText(value: string) {
  return dedupeWords(value
    .normalize("NFKC")
    .replace(/\p{Extended_Pictographic}|\uFE0F/gu, " ")
    .replace(/\b(?:followspanel|follows\s*panel|nitro\s*(?:ng)?|smm\s*world)\b/gi, " ")
    .replace(/\b(?:cheap|old|top)\s+services?\b/gi, " ")
    .replace(/\b(?:lifetime\s+guarantee|lifetime\s+guaranteed)\b/gi, " ")
    .replace(/([,.;:!?])\1+/g, "$1")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/(?:\s*[—-]\s*){2,}/g, " — ")
    .replace(/\s{2,}/g, " ")
    .trim());
}

const platformNames: Array<[RegExp, string]> = [
  [/\binstagram\b/i, "Instagram"], [/\btik\s*tok\b/i, "TikTok"], [/\bfacebook\b|\bfb\b/i, "Facebook"],
  [/\byou\s*tube\b|\byt\b/i, "YouTube"], [/\btelegram\b/i, "Telegram"], [/\btwitter\b|\bx\s*\(twitter\)/i, "X (Twitter)"],
  [/\bspotify\b/i, "Spotify"], [/\bsoundcloud\b/i, "SoundCloud"], [/\bthreads\b/i, "Threads"], [/\bwhats\s*app\b/i, "WhatsApp"],
  [/\blinkedin\b/i, "LinkedIn"], [/\bdiscord\b/i, "Discord"], [/\btwitch\b/i, "Twitch"], [/\bsnapchat\b/i, "Snapchat"],
  [/\bpinterest\b/i, "Pinterest"], [/\breddit\b/i, "Reddit"],
];

const serviceKinds: Array<[RegExp, string]> = [
  [/\bsubscribers?\b/i, "Subscribers"], [/\bmembers?\b/i, "Members"], [/\bfollowers?\b/i, "Followers"],
  [/\bviews?\b|\bwatch(?:\s+time|\s+hours?)?\b/i, "Views"], [/\blikes?\b/i, "Likes"], [/\bcomments?\b/i, "Comments"],
  [/\bshares?\b|\breposts?\b/i, "Shares"], [/\breactions?\b/i, "Reactions"],
  [/\bplays?\b/i, "Plays"], [/\bstreams?\b|\blisteners?\b/i, "Streams"], [/\bengagement\b|\breach\b|\bimpressions?\b/i, "Engagement"],
  [/\bsaves?\b|\bfavorites?\b/i, "Saves"],
];

const countryNames = ["Nigeria", "Ghana", "Kenya", "South Africa", "Uganda", "Tanzania", "Rwanda", "Egypt", "Morocco", "United States", "United Kingdom", "Canada", "Australia", "Germany", "France", "Brazil", "India"];

function detectedPlatform(value: string) { return platformNames.find(([pattern]) => pattern.test(value))?.[1] || null; }
function detectedKind(value: string) { return serviceKinds.find(([pattern]) => pattern.test(value))?.[1] || null; }
function detectedCountry(value: string) { return countryNames.find((country) => new RegExp(`\\b${country.replace(/\s+/g, "\\s+")}\\b`, "i").test(value)) || null; }

export function normalizeServiceCategory(value: string, serviceName = "") {
  const source = cleanText(`${serviceName} ${value}`.replace(/\bserivces\b/gi, "services"));
  const platform = detectedPlatform(source), kind = detectedKind(source);
  if (!platform || !kind) return INTERNAL_REVIEW;
  const family = ["Spotify", "SoundCloud"].includes(platform) ? "Music" : platform;
  return `${family} · ${kind}`.slice(0, 120);
}

/** Converts noisy connection labels into restrained customer copy. */
export function normalizePublicServiceName(rawName: string, category = "") {
  const futurePosts = rawName.match(/\bfuture\s+(\d+)\s+posts?\b/i)?.[1];
  let name = cleanText(rawName)
    .replace(/\[(?:\s*(?:auto|max(?:imum)?|min(?:imum)?|start|speed|day|refill|quality|hq|non[ -]?drop|lifetime)\b)[^\]]*\]/gi, " ")
    .replace(/\b(?:organic|real|safe|guaranteed|non[ -]?drop|no[ -]?drop|instant(?:\s+start)?|super\s*fast|ultra\s*fast|hq|high\s+quality)\b/gi, " ")
    .replace(/\bfuture\s+\d+\s+posts?\b/gi, " ")
    .replace(/\b(?:max(?:imum)?|min(?:imum)?|speed|day|daily)\s*[: -]?\s*\d+[kKmM]?\b/gi, " ")
    .replace(/\b(?:refill|lifetime)\s*[: -]?\s*\d*\s*(?:days?)?\b/gi, " ")
    .replace(/[|_/]+/g, " — ").replace(/[\[\]{}()]+/g, " ")
    .replace(/^[\s—:,.+-]+|[\s—:,.+-]+$/g, "").replace(/\s{2,}/g, " ").trim();
  const context = `${rawName} ${category}`, platform = detectedPlatform(context), country = detectedCountry(context);
  for (const [pattern, label] of platformNames) name = name.replace(pattern, label);
  for (const [pattern, label] of serviceKinds) name = name.replace(pattern, label);
  if (futurePosts) name = name.replace(/\bpost\s+views\b/i, "Future Post Views");
  name = dedupeWords(cleanText(name));
  if (platform && !name.toLocaleLowerCase("en").includes(platform.toLocaleLowerCase("en"))) name = `${platform} ${name}`.trim();
  if (country && !name.toLocaleLowerCase("en").includes(country.toLocaleLowerCase("en"))) name = `${name} — ${country}`;
  if (futurePosts && !new RegExp(`\\b${futurePosts}\\s+posts?\\b`, "i").test(name)) name = `${name} — ${futurePosts} Posts`;
  if ((name.match(/\p{L}/gu) || []).length < 3) name = [platform, detectedKind(context)].filter(Boolean).join(" ") || "Social Media Service";
  return titleCase(name).replace(/\bTik Tok\b/g, "TikTok").replace(/\bYoutube\b/g, "YouTube").slice(0, 140);
}

export function complianceStatusForService(name: string, category = ""): ComplianceStatus {
  const value = `${name} ${category}`.toLocaleLowerCase("en");
  if (/\b(?:account\s*(?:takedown|ban|disable)|mass\s+(?:account\s+)?(?:report(?:ing)?|flag(?:ging)?)|fake\s+(?:app\s+)?reviews?|fabricated\s+reviews?|impersonat(?:e|ion)|harass(?:ment)?|malicious\s+moderation|spam\s+(?:dm|message|comment)|negative\s+reviews?)\b/.test(value)) return "PROHIBITED";
  if (/\b(?:report(?:ing)?|unban|appeal|verification\s+badge|bulk\s+(?:dm|message)|moderation)\b/.test(value)) return "REVIEW_REQUIRED";
  if (/\b(?:test\s+service|do\s+not\s+order|disabled|unavailable|old\s+service)\b/.test(value)) return "PUBLIC_HIDDEN";
  return "APPROVED";
}

function configuredThresholdMinor(name: string, fallbackNgn: bigint) {
  const value = typeof process !== "undefined" ? process.env[name] : undefined;
  if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value)) return fallbackNgn * 100n;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}

export function priceStatusForService(providerRateMinor: bigint, sellingRateMinor: bigint): PriceStatus {
  if (providerRateMinor <= 0n || sellingRateMinor <= 0n || sellingRateMinor < providerRateMinor) return "PRICE_ANOMALY";
  const reviewThreshold = configuredThresholdMinor("SERVICE_RATE_REVIEW_THRESHOLD_NGN", 10_000_000n);
  const anomalyThreshold = configuredThresholdMinor("SERVICE_RATE_ANOMALY_THRESHOLD_NGN", 100_000_000n);
  if (sellingRateMinor > anomalyThreshold) return "PRICE_ANOMALY";
  if (sellingRateMinor > reviewThreshold) return "PRICE_REVIEW";
  return "NORMAL";
}

export function serviceDuplicateGroupKey(input: { publicName: string; category: string; min: number; max: number; type?: string; refill?: boolean; cancel?: boolean }) {
  return [input.publicName, input.category, input.min, input.max, input.type || "", input.refill ? "refill" : "no-refill", input.cancel ? "cancel" : "no-cancel"]
    .join("|").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}|-]+/gu, "-").slice(0, 300);
}

type PublicServiceCandidate = { id: string; name: string; category: string; min: number; max: number; type: string; refill: boolean; cancel: boolean; rateMinor: number; featured: boolean };

/** Keeps one deterministic public representative while retaining every source record internally. */
export function choosePreferredDuplicateServices<T extends PublicServiceCandidate>(services: T[]) {
  const preferred = new Map<string, T>();
  for (const service of services) {
    const key = serviceDuplicateGroupKey({ publicName: service.name, category: service.category, min: service.min, max: service.max, type: service.type, refill: service.refill, cancel: service.cancel });
    const current = preferred.get(key);
    if (!current || Number(service.featured) > Number(current.featured) || (service.featured === current.featured && (service.rateMinor < current.rateMinor || (service.rateMinor === current.rateMinor && service.id.localeCompare(current.id) < 0)))) preferred.set(key, service);
  }
  return [...preferred.values()];
}

/** Stable merchandising that never turns provider ordering into a quality claim. */
export function rankFeaturedServices<T extends PublicServiceCandidate>(services: T[]) {
  return [...services].sort((left, right) =>
    Number(right.featured) - Number(left.featured) ||
    Number(right.refill) - Number(left.refill) ||
    left.rateMinor - right.rateMinor ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id),
  );
}

export function evaluateServiceQuality(input: ServiceQualityInput): ServiceQuality {
  const name = cleanText(input.name), publicName = normalizePublicServiceName(name, input.category);
  const normalizedCategory = normalizeServiceCategory(input.category, name);
  const complianceStatus = complianceStatusForService(name, input.category);
  const priceStatus = priceStatusForService(input.rateMinor, input.sellingRateMinor ?? input.rateMinor);
  const hiddenReasons: string[] = [], letters = (name.match(/\p{L}/gu) || []).length;
  const semanticName = name.replace(/^[^\p{L}\p{N}]+/u, "");
  const instructionOnly = /^(?:please\s+read|read\s+before|try\s+(?:a\s+)?low|important\s+(?:notice|note)|warning)\b/i.test(semanticName);
  if (!input.providerFunded) hiddenReasons.push("provider_unfunded");
  if (name.length < 4 || letters < 3 || /^\d+(?:[.,]\d+)?$/.test(name)) hiddenReasons.push("invalid_service_name");
  if (instructionOnly) hiddenReasons.push("instruction_row");
  if (!Number.isInteger(input.min) || !Number.isInteger(input.max) || input.min < 1 || input.max < input.min) hiddenReasons.push("invalid_order_limits");
  if (normalizedCategory === INTERNAL_REVIEW) hiddenReasons.push("unknown_public_category");
  if (priceStatus !== "NORMAL") hiddenReasons.push(priceStatus.toLocaleLowerCase("en"));
  if (complianceStatus !== "APPROVED") hiddenReasons.push(`compliance_${complianceStatus.toLocaleLowerCase("en")}`);
  return { publicEligible: hiddenReasons.length === 0, publicName, normalizedCategory, hiddenReasons, priceStatus, complianceStatus,
    duplicateGroupKey: serviceDuplicateGroupKey({ publicName, category: normalizedCategory, min: input.min, max: input.max, type: input.type, refill: input.refill, cancel: input.cancel }) };
}
