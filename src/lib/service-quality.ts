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
  | "SEMANTIC_INFORMATION_LOSS"
  | "INACTIVE"
  | "STALE";

export type PublicServiceSemantics = {
  platform: string;
  kind: string;
  variant?: string;
  target?: string;
  region?: string;
  scope?: string;
  reactionPolarity?: "Positive" | "Negative" | "Mixed";
  reactionEmojis?: string[];
  futurePostCount?: number;
  audienceQualifier?: "Female" | "Male" | "Mixed";
  language?: string;
  linkType?: string;
};

/** Compact snapshot form; expanded before any customer or admin rendering. */
export type CompactPublicServiceSemantics = {
  p: string;
  k: string;
  v?: string;
  t?: string;
  r?: string;
  e?: string;
  n?: number;
  l?: string;
};

const semanticCodes = {
  platform: { "Social Media": "sm", Instagram: "ig", TikTok: "tt", Facebook: "fb", YouTube: "yt", Telegram: "tg", "X (Twitter)": "x", Spotify: "sp", SoundCloud: "sc", Threads: "th", WhatsApp: "wa", LinkedIn: "li", Discord: "dc", Twitch: "tw", Snapchat: "sn", Pinterest: "pi", Reddit: "rd", "Apple Music": "am", Audiomack: "au" },
  kind: { Service: "s", Subscribers: "sb", Members: "m", Followers: "f", Views: "v", Likes: "l", Comments: "c", Shares: "sh", Reactions: "r", Plays: "p", Streams: "st", Engagement: "e", Saves: "sv" },
  variant: { Positive: "p", Negative: "n", Mixed: "x", Female: "f", Male: "m" },
  target: { "Live Stream": "ls", Shorts: "sh", Story: "st", Reel: "r", Post: "p", Channel: "c", Group: "g", Page: "pg", Profile: "pr", Video: "v", Track: "t", Playlist: "pl" },
  region: { Nigeria: "ng", Ghana: "gh", Kenya: "ke", "South Africa": "za", Uganda: "ug", Tanzania: "tz", Rwanda: "rw", Egypt: "eg", Morocco: "ma", "United States": "us", "United Kingdom": "gb", Canada: "ca", Australia: "au", Germany: "de", France: "fr", Brazil: "br", India: "in", Worldwide: "ww" },
  language: { English: "en", Arabic: "ar", French: "fr", Spanish: "es", Portuguese: "pt", Hindi: "hi", Urdu: "ur", Turkish: "tr" },
} as const;

function encodeSemantic(group: keyof typeof semanticCodes, value: string | undefined) {
  return value ? (semanticCodes[group] as Record<string, string>)[value] || value : undefined;
}

function decodeSemantic(group: keyof typeof semanticCodes, value: string | undefined) {
  if (!value) return undefined;
  const match = Object.entries(semanticCodes[group]).find(([, code]) => code === value);
  return match?.[0] || value;
}

export type ServiceQualityInput = {
  name: string;
  category: string;
  description?: string;
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
  semantics: PublicServiceSemantics;
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

function sanitizeSemanticSource(value: string) {
  return value
    .normalize("NFKC")
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+|www\.\S+/gi, " ")
    .replace(/\b(?:followspanel|follows\s*panel|nitro\s*(?:ng)?|smm\s*world)\b/gi, " ")
    .replace(/\b(?:api\s*(?:key|endpoint|request)|provider\s*(?:id|price)|support\s*(?:email|phone|whatsapp))\b[^.;|]*/gi, " ")
    .slice(0, 1_000);
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

const languageNames: Array<[RegExp, string]> = [
  [/\benglish\b/i, "English"], [/\barabic\b/i, "Arabic"], [/\bfrench\b/i, "French"], [/\bspanish\b/i, "Spanish"],
  [/\bportuguese\b/i, "Portuguese"], [/\bhindi\b/i, "Hindi"], [/\burdu\b/i, "Urdu"], [/\bturkish\b/i, "Turkish"],
];

const serviceTargets: Array<[RegExp, string]> = [
  [/\blive[\s-]*streams?\b/i, "Live Stream"], [/\bshorts?\b/i, "Shorts"], [/\bstor(?:y|ies)\b/i, "Story"],
  [/\breels?\b/i, "Reel"], [/\bposts?\b/i, "Post"], [/\bchannels?\b/i, "Channel"], [/\bgroups?\b/i, "Group"],
  [/\bpages?\b/i, "Page"], [/\bprofiles?\b/i, "Profile"], [/\bvideos?\b/i, "Video"], [/\btracks?\b/i, "Track"],
  [/\bplaylists?\b/i, "Playlist"],
];

function detectedPlatform(value: string) { return platformNames.find(([pattern]) => pattern.test(value))?.[1] || null; }
function detectedKind(value: string) { return serviceKinds.find(([pattern]) => pattern.test(value))?.[1] || null; }
function detectedRegion(value: string) { return regionNames.find(([pattern]) => pattern.test(value))?.[1] || null; }
function detectedLanguage(value: string) { return languageNames.find(([pattern]) => pattern.test(value))?.[1] || null; }
function detectedTarget(value: string) { return serviceTargets.find(([pattern]) => pattern.test(value))?.[1] || null; }

function reactionEmojis(value: string) {
  const matches = value.match(/\p{Extended_Pictographic}\uFE0F?/gu) || [];
  return [...new Set(matches.map((emoji) => emoji.normalize("NFC")))].slice(0, 8);
}

function linkTypeFor(target: string | null, platform: string | null, kind: string | null) {
  const resolved = target || (kind === "Followers" ? "Profile" : kind === "Members" ? (platform === "Telegram" ? "Channel or Group" : "Profile") : kind === "Reactions" ? "Post" : kind === "Plays" || kind === "Streams" || kind === "Saves" ? "Track" : "Content");
  return `${resolved} URL`;
}

export function compactPublicServiceSemantics(value: PublicServiceSemantics): CompactPublicServiceSemantics {
  return {
    p: encodeSemantic("platform", value.platform)!, k: encodeSemantic("kind", value.kind)!,
    ...(value.variant ? { v: encodeSemantic("variant", value.variant) } : {}),
    ...(value.target ? { t: encodeSemantic("target", value.target) } : {}),
    ...(value.region ? { r: encodeSemantic("region", value.region) } : {}),
    ...(value.reactionEmojis?.length ? { e: value.reactionEmojis.join(" ") } : {}),
    ...(value.futurePostCount ? { n: value.futurePostCount } : {}),
    ...(value.language ? { l: encodeSemantic("language", value.language) } : {}),
  };
}

export function expandPublicServiceSemantics(value: CompactPublicServiceSemantics): PublicServiceSemantics {
  const platform = decodeSemantic("platform", value.p)!;
  const kind = decodeSemantic("kind", value.k)!;
  const variant = decodeSemantic("variant", value.v);
  const target = decodeSemantic("target", value.t);
  const region = decodeSemantic("region", value.r);
  const language = decodeSemantic("language", value.l);
  const reactionPolarity = kind === "Reactions" && ["Positive", "Negative", "Mixed"].includes(variant || "") ? variant as "Positive" | "Negative" | "Mixed" : undefined;
  const audienceQualifier = kind !== "Reactions" && ["Female", "Male", "Mixed"].includes(variant || "") ? variant as "Female" | "Male" | "Mixed" : undefined;
  return {
    platform, kind,
    ...(variant ? { variant } : {}), ...(target ? { target } : {}), ...(region ? { region } : {}),
    ...(value.n ? { scope: "Future Posts", futurePostCount: value.n } : {}),
    ...(reactionPolarity ? { reactionPolarity } : {}),
    ...(value.e ? { reactionEmojis: value.e.split(/\s+/).filter(Boolean) } : {}),
    ...(audienceQualifier ? { audienceQualifier } : {}), ...(language ? { language } : {}),
    linkType: linkTypeFor(target || null, platform, kind),
  };
}

/** Extracts only compact, factual product attributes from provider-controlled text. */
export function extractPublicServiceSemantics(rawName: string, category = "", rawDescription = ""): PublicServiceSemantics {
  const primary = sanitizeSemanticSource(`${rawName} ${category}`);
  const fallback = sanitizeSemanticSource(rawDescription);
  const context = `${primary} ${fallback}`;
  const platform = detectedPlatform(primary) || detectedPlatform(fallback) || "Social Media";
  const kind = detectedKind(primary) || detectedKind(fallback) || "Service";
  const target = detectedTarget(primary) || detectedTarget(fallback);
  const region = detectedRegion(primary) || detectedRegion(fallback);
  const language = detectedLanguage(primary) || detectedLanguage(fallback);
  const futureMatch = context.match(/\bfuture\s+(\d{1,3})\s+posts?\b/i);
  const futurePostCount = futureMatch ? Number(futureMatch[1]) : undefined;
  const polarity = kind === "Reactions"
    ? (/\bpositive\b/i.test(context) ? "Positive" : /\bnegative\b/i.test(context) ? "Negative" : /\bmixed\b/i.test(context) ? "Mixed" : undefined)
    : undefined;
  const audienceQualifier = /\bfemale\b/i.test(context) && /\bmale\b/i.test(context)
    ? "Mixed"
    : /\bfemale\b/i.test(context)
      ? "Female"
      : /\bmale\b/i.test(context)
        ? "Male"
        : kind !== "Reactions" && /\bmixed\b/i.test(context)
          ? "Mixed"
          : undefined;
  const emojis = kind === "Reactions" ? reactionEmojis(`${rawName} ${rawDescription}`) : [];
  const variant = polarity || audienceQualifier;
  return {
    platform, kind,
    ...(variant ? { variant } : {}),
    ...(target ? { target } : {}),
    ...(region ? { region } : {}),
    ...(futurePostCount ? { scope: "Future Posts", futurePostCount } : {}),
    ...(polarity ? { reactionPolarity: polarity } : {}),
    ...(emojis.length ? { reactionEmojis: emojis } : {}),
    ...(audienceQualifier ? { audienceQualifier } : {}),
    ...(language ? { language } : {}),
    linkType: linkTypeFor(target, platform, kind),
  };
}

export function publicNameFromSemantics(semantics: PublicServiceSemantics) {
  const target = semantics.futurePostCount && semantics.kind === "Views" ? "Future Post" : semantics.target;
  const core = [semantics.platform, target, semantics.reactionPolarity, semantics.kind].filter(Boolean).join(" ");
  const qualifiers = [semantics.variant !== semantics.reactionPolarity ? semantics.variant : null, semantics.region, semantics.language, semantics.futurePostCount ? `${semantics.futurePostCount} Posts` : null]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  if (semantics.reactionEmojis?.length) qualifiers.push(semantics.reactionEmojis.join(" "));
  return `${core}${qualifiers.length ? ` — ${qualifiers.join(" — ")}` : ""}`.slice(0, 140);
}

export function normalizeServiceCategory(value: string, serviceName = "") {
  const source = cleanText(`${serviceName} ${value}`.replace(/\bserivces\b/gi, "services"));
  const platform = detectedPlatform(source), kind = detectedKind(source);
  if (!platform || !kind) return INTERNAL_REVIEW;
  const family = ["Spotify", "SoundCloud"].includes(platform) ? "Music" : platform;
  return `${family} · ${kind}`.slice(0, 120);
}

/** Converts noisy provider labels into restrained, deterministic customer copy. */
export function normalizePublicServiceName(rawName: string, category = "", rawDescription = "") {
  const context = `${rawName} ${category}`;
  const platform = detectedPlatform(context), kind = detectedKind(context);
  if (platform && kind) {
    return publicNameFromSemantics(extractPublicServiceSemantics(rawName, category, rawDescription));
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

export function publicServiceDescription(input: { name: string; min: number; max: number; refill: boolean; cancel: boolean; semantics: PublicServiceSemantics }) {
  const { semantics } = input;
  const location = semantics.target || (semantics.kind === "Reactions" ? "Post" : semantics.kind === "Followers" ? "Profile" : semantics.kind === "Members" ? "Channel or Group" : semantics.kind === "Plays" || semantics.kind === "Streams" || semantics.kind === "Saves" ? "Track" : "Content");
  const kind = semantics.kind.toLocaleLowerCase("en");
  const subject = semantics.reactionEmojis?.length
    ? `${semantics.reactionEmojis.join(", ").replace(/, ([^,]*)$/, " and $1")} reactions`
    : semantics.reactionPolarity
      ? `${semantics.reactionPolarity.toLocaleLowerCase("en")} reactions`
      : kind;
  const scope = semantics.futurePostCount ? ` across the next ${semantics.futurePostCount} posts` : "";
  const qualifier = [semantics.audienceQualifier, semantics.region, semantics.language].filter(Boolean).join(", ");
  const article = /^[aeiou]/i.test(semantics.platform) ? "an" : "a";
  const first = `Adds ${subject} to ${article} ${semantics.platform} ${location.toLocaleLowerCase("en")}${scope}${qualifier ? ` for the ${qualifier} option` : ""}.`;
  const link = `Use the direct ${semantics.linkType?.replace(/ URL$/, "").toLocaleLowerCase("en") || "target"} link.`;
  const limits = `Select a quantity from ${input.min.toLocaleString("en-NG")} to ${input.max.toLocaleString("en-NG")}.`;
  return `${first} ${link} ${limits} ${input.refill ? "Refill support is available when its conditions are met." : "Refill is not included."} ${input.cancel ? "Cancellation is available while the order remains eligible." : "Cancellation is not available after submission."}`;
}

export function serviceSearchText(input: { id?: string; name: string; category: string; description?: string; semantics?: PublicServiceSemantics }) {
  const semantics = input.semantics;
  return [input.id, input.name, input.category, input.description, semantics?.platform, semantics?.kind, semantics?.variant, semantics?.target, semantics?.region, semantics?.scope, semantics?.reactionPolarity, semantics?.reactionEmojis?.join(" "), semantics?.futurePostCount, semantics?.audienceQualifier, semantics?.language, semantics?.linkType]
    .filter(Boolean).join(" ").toLocaleLowerCase("en");
}

export function matchesServiceSearch(input: Parameters<typeof serviceSearchText>[0], query: string) {
  const terms = query.trim().toLocaleLowerCase("en").split(/\s+/).filter(Boolean);
  const haystack = serviceSearchText(input);
  return terms.every((term) => haystack.includes(term));
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

export function serviceDuplicateGroupKey(input: { publicName: string; category: string; min: number; max: number; type?: string; refill?: boolean; cancel?: boolean; semantics?: PublicServiceSemantics }) {
  const emojiKey = input.semantics?.reactionEmojis?.map((emoji) => [...emoji].map((part) => part.codePointAt(0)?.toString(16)).join(".")).join("+");
  const semanticKey = input.semantics ? [input.semantics.variant, input.semantics.target, input.semantics.region, input.semantics.scope, input.semantics.reactionPolarity, emojiKey, input.semantics.futurePostCount, input.semantics.audienceQualifier, input.semantics.language, input.semantics.linkType].filter(Boolean).join(":") : "";
  return [input.publicName, input.category, semanticKey, input.min, input.max, input.type || "", input.refill ? "refill" : "no-refill", input.cancel ? "cancel" : "no-cancel"]
    .join("|").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}|-]+/gu, "-").slice(0, 300);
}

type PublicServiceCandidate = { id: string; name: string; category: string; min: number; max: number; type: string; refill: boolean; cancel: boolean; rateMinor: number; featured: boolean; active?: boolean; semantics?: PublicServiceSemantics };

/** Keeps one deterministic public representative while retaining every source record internally. */
export function choosePreferredDuplicateServices<T extends PublicServiceCandidate>(services: T[]) {
  const preferred = new Map<string, T>();
  for (const service of services) {
    const key = serviceDuplicateGroupKey({ publicName: service.name, category: service.category, min: service.min, max: service.max, type: service.type, refill: service.refill, cancel: service.cancel, semantics: service.semantics });
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
    SEMANTIC_INFORMATION_LOSS: "semantic_information_loss", INACTIVE: "inactive", STALE: "stale",
  };
  return aliases[code];
}

export function evaluateServiceQuality(input: ServiceQualityInput): ServiceQuality {
  const name = cleanText(input.name), semantics = extractPublicServiceSemantics(input.name, input.category, input.description);
  const publicName = normalizePublicServiceName(input.name, input.category, input.description);
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
  const definingValues = [semantics.variant, semantics.target, semantics.region, semantics.reactionPolarity, semantics.reactionEmojis?.join(" "), semantics.futurePostCount ? `${semantics.futurePostCount} posts` : null, semantics.audienceQualifier, semantics.language].filter(Boolean).map(String);
  const publicMeaning = publicName.toLocaleLowerCase("en");
  if (definingValues.some((value) => !publicMeaning.includes(value.toLocaleLowerCase("en")))) reasonCodes.push("SEMANTIC_INFORMATION_LOSS");
  const publicEligible = reasonCodes.filter((code) => code !== "MALFORMED_NAME").length === 0;
  return {
    eligible: publicEligible, publicEligible, reasonCodes, normalizedPublicName: publicName, publicName,
    normalizedPublicCategory: normalizedCategory, normalizedCategory, hiddenReasons: reasonCodes.map(legacyReason),
    pricingStatus: priceStatus, priceStatus, complianceStatus, semantics,
    duplicateGroupKey: serviceDuplicateGroupKey({ publicName, category: normalizedCategory, min: input.min, max: input.max, type: input.type, refill: input.refill, cancel: input.cancel, semantics }),
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
export function sanitizePublicCatalogCandidate<T extends PublicServiceCandidate>(item: T): (T & { semantics: PublicServiceSemantics }) | null {
  if (item.active === false || !Number.isSafeInteger(item.rateMinor)) return null;
  const quality = evaluateServiceQuality({
    name: item.name, category: item.category, min: item.min, max: item.max,
    rateMinor: BigInt(item.rateMinor), sellingRateMinor: BigInt(item.rateMinor), providerFunded: true,
    type: item.type, refill: item.refill, cancel: item.cancel, active: true,
  });
  if (!quality.publicEligible) return null;
  return { ...item, name: quality.publicName, category: quality.normalizedCategory, semantics: item.semantics || quality.semantics };
}
