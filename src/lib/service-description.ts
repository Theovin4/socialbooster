import { createHash } from "node:crypto";
import { publicServiceDescription, type PublicServiceSemantics } from "./service-quality";

export type DescriptionSource = "provider" | "generated_fallback";
export type PublicServiceDetails = {
  serviceId: string;
  publicId: string;
  fullDescription: string;
  shortDescription: string;
  descriptionHash: string;
  descriptionSource: DescriptionSource;
};

export type PublicServiceDescriptionInput = {
  serviceId: string;
  publicId: string;
  name: string;
  category: string;
  type: string;
  min: number;
  max: number;
  refill: boolean;
  cancel: boolean;
  semantics: PublicServiceSemantics;
  providerDescription?: string | null;
};

const PRIVATE_LINE = /^(?:api\s*(?:key|endpoint)|provider\s*(?:note|balance|price|cost|id)|wholesale\s*(?:price|rate)|internal\s*(?:note|instruction)|for\s+admin|do\s+not\s+share)\b/i;
const PROVIDER_NAME = /\b(?:follows?\s*panel|followspanel|nitro\s*(?:ng)?|smm\s*world)\b/gi;

function decodeEntities(value: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (match, hex, decimal, name) => {
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    return named[String(name).toLowerCase()] ?? match;
  });
}

function capAtWord(value: string, max = 5_000) {
  if (value.length <= max) return value;
  const candidate = value.slice(0, max - 1);
  const boundary = Math.max(candidate.lastIndexOf("\n"), candidate.lastIndexOf(" "));
  return `${candidate.slice(0, boundary > max * 0.8 ? boundary : candidate.length).trimEnd()}…`;
}

/** Removes unsafe/private provider material while retaining customer-facing facts and line structure. */
export function sanitizePublicServiceDescription(raw: string) {
  let value = String(raw || "").normalize("NFKC")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(?:br\s*\/?|\/p|\/div|\/li|\/h[1-6])\s*>/gi, "\n")
    .replace(/<(?:p|div|li|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  value = decodeEntities(value)
    .replace(/https?:\/\/\S+|www\.\S+/gi, " ")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, " ")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, " ")
    .replace(PROVIDER_NAME, " ")
    .replace(/\bservice\s*(?:id|#)\s*[:#-]?\s*[a-z0-9_-]+\b/gi, " ")
    .replace(/\b(?:provider|wholesale)\s*(?:price|cost|rate|balance)\s*[:=-]?\s*(?:₦|\$|ngn|usd)?\s*[\d,.]+\b/gi, " ")
    .replace(/[|•]+/g, "\n");
  const lines = value.split(/\r?\n/).map((line) => line.replace(/[ \t]+/g, " ").replace(/^[-–—\s]+|[-–—\s]+$/g, "").trim())
    .filter((line) => line && !PRIVATE_LINE.test(line));
  const deduped = lines.filter((line, index) => index === 0 || line.toLocaleLowerCase("en") !== lines[index - 1].toLocaleLowerCase("en"));
  return capAtWord(deduped.join("\n").replace(/\n{3,}/g, "\n\n").trim());
}

export function buildPublicServiceDetails(input: PublicServiceDescriptionInput): PublicServiceDetails {
  const shortDescription = publicServiceDescription(input).trim();
  const sanitized = sanitizePublicServiceDescription(input.providerDescription || "");
  const usableProviderDescription = sanitized.length >= 12 && /[\p{L}\p{N}]/u.test(sanitized);
  const fullDescription = capAtWord(usableProviderDescription ? sanitized : shortDescription);
  const descriptionSource: DescriptionSource = usableProviderDescription ? "provider" : "generated_fallback";
  const descriptionHash = createHash("sha256").update(`${descriptionSource}\n${fullDescription}`).digest("hex");
  return { serviceId: input.serviceId, publicId: input.publicId, fullDescription, shortDescription, descriptionHash, descriptionSource };
}

export function containsPrivateProviderLeak(value: string) {
  return /\b(?:follows?\s*panel|followspanel|nitro\s*(?:ng)?|smm\s*world)\b|https?:\/\/|www\.|\bapi\s*(?:key|endpoint)\b|\b(?:provider|wholesale)\s*(?:price|cost|balance)\b/i.test(value);
}
