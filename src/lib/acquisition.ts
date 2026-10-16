export type AcquisitionTouch = {
  source: string;
  medium: string;
  campaign: string;
  content?: string;
  term?: string;
  landingPath: string;
  capturedAt: string;
};

export type GrowthContext = {
  firstTouch?: AcquisitionTouch;
  lastTouch?: AcquisitionTouch;
  referralCode?: string;
  resellerInterest?: boolean;
};

const SAFE_VALUE = /[^\p{L}\p{N} ._+:/-]/gu;
const REFERRAL_CODE = /^[A-Z0-9]{8,24}$/;

function cleanValue(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const clean = value.trim().replace(SAFE_VALUE, "").replace(/\s+/g, " ").slice(0, 100);
  return clean || fallback;
}

function cleanOptional(value: unknown) {
  if (typeof value !== "string") return undefined;
  const clean = value.trim().replace(SAFE_VALUE, "").replace(/\s+/g, " ").slice(0, 100);
  return clean || undefined;
}

function cleanPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value.split(/[?#]/, 1)[0].slice(0, 180) || "/";
}

function cleanTimestamp(value: unknown) {
  if (typeof value !== "string") return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

export function normalizeAcquisitionTouch(input: unknown): AcquisitionTouch | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  const source = cleanValue(value.source, "direct_or_unknown");
  const medium = cleanValue(value.medium, "none");
  const campaign = cleanValue(value.campaign, "unattributed");
  return {
    source,
    medium,
    campaign,
    ...(cleanOptional(value.content) ? { content: cleanOptional(value.content) } : {}),
    ...(cleanOptional(value.term) ? { term: cleanOptional(value.term) } : {}),
    landingPath: cleanPath(value.landingPath),
    capturedAt: cleanTimestamp(value.capturedAt),
  };
}

export function unattributedTouch(capturedAt = new Date().toISOString()): AcquisitionTouch {
  return { source: "direct_or_unknown", medium: "none", campaign: "unattributed", landingPath: "/", capturedAt };
}

export function normalizeReferralCode(input: unknown) {
  if (typeof input !== "string") return undefined;
  const code = input.trim().toUpperCase();
  return REFERRAL_CODE.test(code) ? code : undefined;
}

export function normalizeGrowthContext(input: unknown): GrowthContext {
  if (!input || typeof input !== "object") return {};
  const value = input as Record<string, unknown>;
  const firstTouch = normalizeAcquisitionTouch(value.firstTouch);
  const lastTouch = normalizeAcquisitionTouch(value.lastTouch);
  const referralCode = normalizeReferralCode(value.referralCode);
  return {
    ...(firstTouch ? { firstTouch } : {}),
    ...(lastTouch ? { lastTouch } : {}),
    ...(referralCode ? { referralCode } : {}),
    ...(value.resellerInterest === true ? { resellerInterest: true } : {}),
  };
}

export function attributionDimensions(touch: AcquisitionTouch) {
  return { source: touch.source, medium: touch.medium, campaign: touch.campaign };
}
