import { DEFAULT_GROSS_MARGIN_BPS, sellingPriceForGrossMarginMinor } from "./money";

export type PriceStatus = "NORMAL" | "PRICE_REVIEW" | "PRICE_ANOMALY";
export type ComplianceStatus = "APPROVED" | "REVIEW_REQUIRED" | "PUBLIC_HIDDEN" | "PROHIBITED";
export type ServiceReasonCode =
  | "PROVIDER_UNFUNDED"
  | "INVALID_SERVICE_NAME"
  | "INSTRUCTION_ROW"
  | "INVALID_ORDER_LIMITS"
  | "UNMAPPED_CATEGORY"
  | "PRICE_REVIEW"
  | "PRICE_ANOMALY"
  | "NON_SERVICE_RECORD"
  | "MALFORMED_NAME"
  | "COMPLIANCE_REVIEW"
  | "COMPLIANCE_HIDDEN"
  | "COMPLIANCE_PROHIBITED"
  | "INACTIVE"
  | "STALE";

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
  active?: boolean;
  stale?: boolean;
};

export type ServiceQuality = {
  eligible: boolean;
  publicEligible: boolean;
  reasonCodes: ServiceReasonCode[];
  normalizedPublicName: string;
  publicName: string;
  normalizedPublicCategory: string;
  normalizedCategory: string;
  hiddenReasons: string[];
  pricingStatus: PriceStatus;
  priceStatus: PriceStatus;
  complianceStatus: ComplianceStatus;
  duplicateGroupKey: string;
};

const INTERNAL_REVIEW = "INTERNAL_REVIEW";
export const SERVICE_UNAVAILABLE_MESSAGE = "This service is temporarily unavailable. Please choose another option.";

export class ServiceUnavailableError extends Error {
  constructor() {
    super(SERVICE_UNAVAILABLE_MESSAGE);
    this.name = "ServiceUnavailableError";
  }
}

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
    .replace(/[⌊⌋⌈⌉]+/g, " ")
    .replace(/\b(?:followspanel|follows\s*panel|nitro\s*(?:ng)?|smm\s*world)\b/gi, " ")
    .replace(/\b(?:cheap|old|top)\s+services?\b/gi, " ")
    .replace(/\bstrat\b/gi, "start")
    .replace(/([,.;:!?])\1+/g, "$1")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/(?:\s*[—-]\s*){2,}/g, " — ")
    .replace(/\s{2,}/g, " ")
    .trim());
}

const platformNames: Array<[RegExp, string]> = [
  [/\bapple\s*music\b|\bapplemusic\b/i, "Apple Music"], [/\baudio\s*mack\b|\baudiomack\b/i, "Audiomack"],
  [/\binstagram\b/i, "Instagram"], [/\btik\s*tok\b/i, "TikTok"], [/\bfacebook\b|\bfb\b/i, "Facebook"],
  [/\byou\s*tube\b|\byt\b/i, "YouTube"], [/\btelegram\b/i, "Telegram"], [/\btwitter\b|\bx\s*\(twitter\)/i, "X (Twitter)"],
  [/\bspotify\b/i, "Spotify"], [/\bsound\s*cloud\b/i, "SoundCloud"], [/\bthreads\b/i, "Threads"], [/\bwhats\s*app\b/i, "WhatsApp"],
  [/\blinked\s*in\b/i, "LinkedIn"], [/\bdiscord\b/i, "Discord"], [/\btwitch\b/i, "Twitch"], [/\bsnap\s*chat\b/i, "Snapchat"],
  [/\bpinterest\b/i, "Pinterest"], [/\breddit\b/i, "Reddit"],
];

const serviceKinds: Array<[RegExp, string]> = [
  [/\bsubscribers?\b/i, "Subscribers"], [/\bmembers?\b/i, "Members"], [/\bfollowers?\b/i, "Followers"],
  [/\bviews?\b|\bwatch(?:\s+time|\s+hours?)?\b/i, "Views"], [/\blikes?\b/i, "Likes"], [/\bcomments?\b/i, "Comments"],
  [/\bshares?\b|\breposts?\b/i, "Shares"], [/\breactions?\b/i, "Reactions"],
  [/\bplays?\b/i, "Plays"], [/\bstreams?\b|\blisteners?\b/i, "Streams"], [/\bengagement\b|\breach\b|\bimpressions?\b/i, "Engagement"],
  [/\bsaves?\b|\bfavorites?\b/i, "Saves"],
];

const regionNames: Array<[RegExp, string]> = [
  [/\b(?:nigeria|nigerian)\b/i, "Nigeria"], [/\bghana(?:ian)?\b/i, "Ghana"], [/\bkenya(?:n)?\b/i, "Kenya"],
  [/\bsouth\s+africa(?:n)?\b/i, "South Africa"], [/\buganda(?:n)?\b/i, "Uganda"], [/\btanzania(?:n)?\b/i, "Tanzania"],
  [/\brwanda(?:n)?\b/i, "Rwanda"], [/\begypt(?:ian)?\b/i, "Egypt"], [/\bmorocc(?:o|an)\b/i, "Morocco"],
  [/\b(?:united\s+states|usa|u\.s\.a\.?|american)\b/i, "United States"], [/\b(?:united\s+kingdom|uk|u\.k\.?|british)\b/i, "United Kingdom"],
  [/\b(?:canada|canadian)\b/i, "Canada"], [/\baustralia(?:n)?\b/i, "Australia"], [/\b(?:germany|german)\b/i, "Germany"],
  [/\b(?:france|french)\b/i, "France"], [/\bbrazil(?:ian)?\b/i, "Brazil"], [/\bindia(?:n)?\b/i, "India"],
  [/\b(?:worldwide|global)\b/i, "Worldwide"],
];

function detectedPlatform(value: string) { return platformNames.find(([pattern]) => pattern.test(value))?.[1] || null; }
function detectedKind(value: string) { return serviceKinds.find(([pattern]) => pattern.test(value))?.[1] || null; }
function detectedRegion(value: string) { return regionNames.find(([pattern]) => pattern.test(value))?.[1] || null; }

export function normalizeServiceCategory(value: string, serviceName = "") {
  const source = cleanText(`${serviceName} ${value}`.replace(/\bserivces\b/gi, "services"));
  const platform = detectedPlatform(source), kind = detectedKind(source);
  if (!platform || !kind) return INTERNAL_REVIEW;
  const family = ["Spotify", "SoundCloud"].includes(platform) ? "Music" : platform;
  return `${family} · ${kind}`.slice(0, 120);
}

/** Converts noisy provider labels into restrained, deterministic customer copy. */
export function normalizePublicServiceName(rawName: string, category = "") {
  const context = `${rawName} ${category}`;
  const platform = detectedPlatform(context), kind = detectedKind(context), region = detectedRegion(context);
  const futurePosts = rawName.match(/\bfuture\s+(\d+)\s+posts?\b/i)?.[1];
  if (platform && kind) {
    const modifier = futurePosts && kind === "Views" ? "Future Post Views" : kind;
    return `${platform} ${modifier}${region ? ` — ${region}` : ""}${futurePosts ? ` — ${futurePosts} Posts` : ""}`.slice(0, 140);
  }

  let name = cleanText(rawName)
    .replace(/\[(?:\s*(?:auto|max(?:imum)?|min(?:imum)?|start|speed|day|refill|quality|hq|non[ -]?drop|lifetime)\b)[^\]]*\]/gi, " ")
    .replace(/\b(?:organic|real|safe|guarantee(?:d)?|non[ -]?drop|no[ -]?drop|instant(?:\s+start)?|super\s*fast|ultra\s*fast|hq|high\s+quality|lifetime)\b/gi, " ")
    .replace(/\b(?:max(?:imum)?|min(?:imum)?|speed|start|day|daily)\s*[: -]?\s*\d+[kKmM]?(?:\s*[-–]\s*\d+[kKmM]?)?\b/gi, " ")
    .replace(/[|_/]+/g, " — ").replace(/[\[\]{}()]+/g, " ")
    .replace(/\s*[,;:]\s*(?=(?:,|;|:|—|$))/g, " ")
    .replace(/^[\s—:,.+-]+|[\s—:,.+-]+$/g, "").replace(/\s{2,}/g, " ").trim();
  name = dedupeWords(cleanText(name));
  if ((name.match(/\p{L}/gu) || []).length < 3) name = [platform, kind].filter(Boolean).join(" ") || "Social Media Service";
  return titleCase(name).replace(/\bTik Tok\b/g, "TikTok").replace(/\bYoutube\b/g, "YouTube").replace(/\bApplemusic\b/g, "Apple Music").replace(/\bAudiomack\b/g, "Audiomack").slice(0, 140);
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

type PriceContext = { name?: string; category?: string; min?: number; max?: number };

/** Absolute sanity checks plus contextual checks for header-like one-unit rows. */
export function priceStatusForService(providerRateMinor: bigint, sellingRateMinor: bigint, context: PriceContext = {}): PriceStatus {
  if (providerRateMinor <= 0n || sellingRateMinor <= 0n || sellingRateMinor < providerRateMinor) return "PRICE_ANOMALY";
  const absoluteThreshold = configuredThresholdMinor("SERVICE_RATE_ABSOLUTE_SANITY_NGN", 10_000_000_000n);
  if (providerRateMinor > absoluteThreshold || sellingRateMinor > absoluteThreshold) return "PRICE_ANOMALY";

  const source = `${context.name || ""} ${context.category || ""}`;
  const meaningfulService = Boolean(detectedPlatform(source) && detectedKind(source));
  const oneUnitRecord = context.min === 1 && context.max === 1;
  const contextualThreshold = configuredThresholdMinor("SERVICE_RATE_CONTEXT_REVIEW_NGN", 1_000_000_000n);
  if (sellingRateMinor > contextualThreshold && (!meaningfulService || oneUnitRecord)) return "PRICE_ANOMALY";
  return "NORMAL";
}

export function serviceDuplicateGroupKey(input: { publicName: string; category: string; min: number; max: number; type?: string; refill?: boolean; cancel?: boolean }) {
  return [input.publicName, input.category, input.min, input.max, input.type || "", input.refill ? "refill" : "no-refill", input.cancel ? "cancel" : "no-cancel"]
    .join("|").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}|-]+/gu, "-").slice(0, 300);
}

type PublicServiceCandidate = { id: string; name: string; category: string; min: number; max: number; type: string; refill: boolean; cancel: boolean; rateMinor: number; featured: boolean; active?: boolean };

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

function nonServiceRecord(input: ServiceQualityInput) {
  const name = cleanText(input.name).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  const genericHeader = /^(?:(?:apple\s*music|audiomack|instagram|facebook|tik\s*tok|youtube|telegram|spotify|soundcloud|twitter|x)(?:\s+(?:usa|uk|nigeria|worldwide|global))?\s+)?services?(?:\s+area)?$/i.test(name);
  const placeholder = /^(?:all\s+services?|category|service\s+list|select\s+service|placeholder)$/i.test(name);
  const noAction = !detectedKind(`${input.name} ${input.category}`);
  const oneUnit = input.min === 1 && input.max === 1;
  const implausible = (input.sellingRateMinor ?? input.rateMinor) > configuredThresholdMinor("SERVICE_RATE_CONTEXT_REVIEW_NGN", 1_000_000_000n);
  return (genericHeader && noAction) || placeholder || (noAction && oneUnit && implausible);
}

function legacyReason(code: ServiceReasonCode) {
  const aliases: Record<ServiceReasonCode, string> = {
    PROVIDER_UNFUNDED: "provider_unfunded", INVALID_SERVICE_NAME: "invalid_service_name", INSTRUCTION_ROW: "instruction_row",
    INVALID_ORDER_LIMITS: "invalid_order_limits", UNMAPPED_CATEGORY: "unknown_public_category", PRICE_REVIEW: "price_review",
    PRICE_ANOMALY: "price_anomaly", NON_SERVICE_RECORD: "non_service_record", MALFORMED_NAME: "malformed_name",
    COMPLIANCE_REVIEW: "compliance_review_required", COMPLIANCE_HIDDEN: "compliance_public_hidden", COMPLIANCE_PROHIBITED: "compliance_prohibited",
    INACTIVE: "inactive", STALE: "stale",
  };
  return aliases[code];
}

export function evaluateServiceQuality(input: ServiceQualityInput): ServiceQuality {
  const name = cleanText(input.name), publicName = normalizePublicServiceName(name, input.category);
  const normalizedCategory = normalizeServiceCategory(input.category, name);
  const complianceStatus = complianceStatusForService(name, input.category);
  const priceStatus = priceStatusForService(input.rateMinor, input.sellingRateMinor ?? input.rateMinor, input);
  const reasonCodes: ServiceReasonCode[] = [], letters = (name.match(/\p{L}/gu) || []).length;
  const semanticName = name.replace(/^[^\p{L}\p{N}]+/u, "");
  const instructionOnly = /^(?:please\s+read|read\s+before|try\s+(?:a\s+)?low|important\s+(?:notice|note)|warning)\b/i.test(semanticName);
  const malformedName = /(?:^|\s)[,;:](?:\s|$)|[⌊⌋⌈⌉]|\bstrat\b|(?:\b(?:worldwide|global|nigeria|nigerian|usa)\b.*){2}/i.test(input.name);
  if (!input.providerFunded) reasonCodes.push("PROVIDER_UNFUNDED");
  if (name.length < 4 || letters < 3 || /^\d+(?:[.,]\d+)?$/.test(name)) reasonCodes.push("INVALID_SERVICE_NAME");
  if (instructionOnly) reasonCodes.push("INSTRUCTION_ROW");
  if (!Number.isSafeInteger(input.min) || !Number.isSafeInteger(input.max) || input.min < 1 || input.max < input.min) reasonCodes.push("INVALID_ORDER_LIMITS");
  if (nonServiceRecord(input)) reasonCodes.push("NON_SERVICE_RECORD");
  if (malformedName) reasonCodes.push("MALFORMED_NAME");
  if (normalizedCategory === INTERNAL_REVIEW) reasonCodes.push("UNMAPPED_CATEGORY");
  if (priceStatus !== "NORMAL") reasonCodes.push(priceStatus);
  if (complianceStatus === "REVIEW_REQUIRED") reasonCodes.push("COMPLIANCE_REVIEW");
  if (complianceStatus === "PUBLIC_HIDDEN") reasonCodes.push("COMPLIANCE_HIDDEN");
  if (complianceStatus === "PROHIBITED") reasonCodes.push("COMPLIANCE_PROHIBITED");
  if (input.active === false) reasonCodes.push("INACTIVE");
  if (input.stale) reasonCodes.push("STALE");
  const publicEligible = reasonCodes.filter((code) => code !== "MALFORMED_NAME").length === 0;
  return {
    eligible: publicEligible, publicEligible, reasonCodes, normalizedPublicName: publicName, publicName,
    normalizedPublicCategory: normalizedCategory, normalizedCategory, hiddenReasons: reasonCodes.map(legacyReason),
    pricingStatus: priceStatus, priceStatus, complianceStatus,
    duplicateGroupKey: serviceDuplicateGroupKey({ publicName, category: normalizedCategory, min: input.min, max: input.max, type: input.type, refill: input.refill, cancel: input.cancel }),
  };
}

function safeMinor(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? BigInt(number) : 0n;
}

/** Re-evaluates the complete stored service immediately before order mutation. */
export function evaluateStoredServiceEligibility(data: Record<string, unknown>): ServiceQuality {
  const providerRateMinor = safeMinor(data.providerRateNgnMinor ?? data.providerRateMinor);
  const sellingRateMinor = safeMinor(data.sellingRateMinor);
  const quality = evaluateServiceQuality({
    name: String(data.rawName || data.name || data.publicName || ""),
    category: String(data.rawCategoryName || data.categoryName || ""),
    min: Number(data.minQuantity), max: Number(data.maxQuantity),
    rateMinor: providerRateMinor, sellingRateMinor, providerFunded: true,
    type: String(data.type || ""), refill: data.refillSupported === true, cancel: data.cancelSupported === true,
    active: data.active === true,
  });
  const exactSellingRate = sellingPriceForGrossMarginMinor(providerRateMinor, DEFAULT_GROSS_MARGIN_BPS);
  if (sellingRateMinor !== exactSellingRate && !quality.reasonCodes.includes("PRICE_ANOMALY")) quality.reasonCodes.push("PRICE_ANOMALY");
  if (data.publicEligibility === "hidden" && !quality.reasonCodes.includes("INACTIVE")) quality.reasonCodes.push("INACTIVE");
  if (["PRICE_REVIEW", "PRICE_ANOMALY"].includes(String(data.priceStatus || "NORMAL")) && !quality.reasonCodes.includes("PRICE_ANOMALY")) quality.reasonCodes.push("PRICE_ANOMALY");
  if (["REVIEW_REQUIRED", "PUBLIC_HIDDEN", "PROHIBITED"].includes(String(data.complianceStatus || "APPROVED")) && !quality.reasonCodes.includes("COMPLIANCE_REVIEW")) quality.reasonCodes.push("COMPLIANCE_REVIEW");
  quality.hiddenReasons = quality.reasonCodes.map(legacyReason);
  quality.eligible = quality.publicEligible = quality.reasonCodes.filter((code) => code !== "MALFORMED_NAME").length === 0;
  return quality;
}

export function assertServiceOrderEligible(data: Record<string, unknown>) {
  const quality = evaluateStoredServiceEligibility(data);
  if (!quality.publicEligible) throw new ServiceUnavailableError();
  return quality;
}

/** Secondary zero-read guard for legacy snapshot rows already in cache. */
export function sanitizePublicCatalogCandidate<T extends PublicServiceCandidate>(item: T): T | null {
  if (item.active === false || !Number.isSafeInteger(item.rateMinor)) return null;
  const quality = evaluateServiceQuality({
    name: item.name, category: item.category, min: item.min, max: item.max,
    rateMinor: BigInt(item.rateMinor), sellingRateMinor: BigInt(item.rateMinor), providerFunded: true,
    type: item.type, refill: item.refill, cancel: item.cancel, active: true,
  });
  if (!quality.publicEligible) return null;
  return { ...item, name: quality.publicName, category: quality.normalizedCategory };
}
