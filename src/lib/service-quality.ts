export type ServiceQualityInput = {
  name: string;
  category: string;
  min: number;
  max: number;
  rateMinor: bigint;
  providerFunded: boolean;
};

export type ServiceQuality = {
  publicEligible: boolean;
  publicName: string;
  normalizedCategory: string;
  hiddenReasons: string[];
};

function titleCase(value: string) {
  return value.toLocaleLowerCase("en").replace(/(^|[\s/|()[\]-])\p{L}/gu, (match) => match.toLocaleUpperCase("en"));
}

export function normalizeServiceCategory(value: string) {
  let category = value
    .replace(/\bserivces\b/gi, "services")
    .replace(/^[\s\-_=*~|.:]+|[\s\-_=*~|.:]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const categoryWithoutKnownWords = category.replace(/services?/gi, "");
  if (categoryWithoutKnownWords === categoryWithoutKnownWords.toLocaleUpperCase("en")) category = titleCase(category);
  if ((category.match(/\p{L}/gu) || []).length < 3) category = "Other services";
  return category.slice(0, 120);
}

const platformNames: Array<[RegExp, string]> = [
  [/\binstagram\b/i, "Instagram"],
  [/\btik\s*tok\b/i, "TikTok"],
  [/\bfacebook\b|\bfb\b/i, "Facebook"],
  [/\byou\s*tube\b|\byt\b/i, "YouTube"],
  [/\btelegram\b/i, "Telegram"],
  [/\btwitter\b|\bx\s*\(twitter\)/i, "X (Twitter)"],
  [/\bspotify\b/i, "Spotify"],
  [/\bsoundcloud\b/i, "SoundCloud"],
  [/\bthreads\b/i, "Threads"],
  [/\bwhats\s*app\b/i, "WhatsApp"],
];

/**
 * Converts noisy connection-provided labels into a restrained customer-facing
 * name. It removes operational metadata and unsupported marketing claims, but
 * never invents quality promises. The untouched name remains stored for admin
 * troubleshooting.
 */
export function normalizePublicServiceName(rawName: string, category = "") {
  const futurePosts = rawName.match(/\bfuture\s+(\d+)\s+posts?\b/i)?.[1];
  let name = rawName
    .normalize("NFKC")
    .replace(/\p{Extended_Pictographic}|\uFE0F/gu, " ")
    .replace(/\[(?:\s*(?:auto|max(?:imum)?|min(?:imum)?|start|speed|day|refill|quality|hq|non[ -]?drop|lifetime)\b)[^\]]*\]/gi, " ")
    .replace(/\b(?:organic|real|safe|guaranteed|non[ -]?drop|no[ -]?drop|instant(?:\s+start)?|super\s*fast|ultra\s*fast|hq|high\s+quality)\b/gi, " ")
    .replace(/\bfuture\s+\d+\s+posts?\b/gi, " ")
    .replace(/\b(?:max(?:imum)?|min(?:imum)?|speed|day|daily)\s*[: -]?\s*\d+[kKmM]?\b/gi, " ")
    .replace(/\b(?:refill|lifetime)\s*[: -]?\s*\d*\s*(?:days?)?\b/gi, " ")
    .replace(/[|_/]+/g, " — ")
    .replace(/[\[\]{}()]+/g, " ")
    .replace(/(?:\s*[—-]\s*){2,}/g, " — ")
    .replace(/^[\s—:,.+-]+|[\s—:,.+-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const platform = platformNames.find(([pattern]) => pattern.test(`${rawName} ${category}`))?.[1];
  for (const [pattern, label] of platformNames) name = name.replace(pattern, label);
  name = name
    .replace(/\bpost\s+views\b/i, futurePosts ? "Future Post Views" : "Post Views")
    .replace(/\bfollowers?\b/i, "Followers")
    .replace(/\bsubscribers?\b/i, "Subscribers")
    .replace(/\blikes?\b/i, "Likes")
    .replace(/\bviews?\b/i, "Views")
    .replace(/\bcomments?\b/i, "Comments")
    .replace(/\bshares?\b/i, "Shares")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (platform && !name.toLocaleLowerCase("en").includes(platform.toLocaleLowerCase("en"))) name = `${platform} ${name}`.trim();
  if (futurePosts && !new RegExp(`\\b${futurePosts}\\s+posts?\\b`, "i").test(name)) name = `${name} — ${futurePosts} Posts`;
  if ((name.match(/\p{L}/gu) || []).length < 3) name = `${platform || normalizeServiceCategory(category).replace(/\s+services?$/i, "")} Service`.trim();
  return name.slice(0, 140);
}

export function evaluateServiceQuality(input: ServiceQualityInput): ServiceQuality {
  const name = input.name.replace(/\s{2,}/g, " ").trim();
  const publicName = normalizePublicServiceName(name, input.category);
  const hiddenReasons: string[] = [];
  const letters = (name.match(/\p{L}/gu) || []).length;
  const semanticName = name.replace(/^[^\p{L}\p{N}]+/u, "");
  const instructionOnly = /^(?:please\s+read|read\s+before|try\s+(?:a\s+)?low|important\s+(?:notice|note)|warning)\b/i.test(semanticName);

  if (!input.providerFunded) hiddenReasons.push("provider_unfunded");
  if (name.length < 4 || letters < 3 || /^\d+(?:[.,]\d+)?$/.test(name)) hiddenReasons.push("invalid_service_name");
  if (instructionOnly) hiddenReasons.push("instruction_row");
  if (!Number.isInteger(input.min) || !Number.isInteger(input.max) || input.min < 1 || input.max < input.min) hiddenReasons.push("invalid_order_limits");
  if (input.rateMinor <= 0n) hiddenReasons.push("invalid_provider_rate");

  return {
    publicEligible: hiddenReasons.length === 0,
    publicName,
    normalizedCategory: normalizeServiceCategory(input.category),
    hiddenReasons,
  };
}
