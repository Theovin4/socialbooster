import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export type GatewayMode = "off" | "shadow" | "enforce";

const identifier = z.string().trim().min(1).max(200);
const envelopeSchema = z.object({
  schemaVersion: z.literal(1),
  deliveryId: identifier,
  eventId: identifier,
  applicationId: z.literal("social_booster"),
  eventType: identifier,
  internalEntityId: identifier,
  ownership: z.object({
    source: z.enum(["intent", "subscription"]),
    txRef: identifier.nullable(),
    providerSubscriptionId: identifier.nullable(),
  }).strict(),
  verification: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("provider_transaction"),
      apiVersion: z.enum(["v3", "v4"]),
      providerTransactionId: identifier,
      status: identifier,
      amountMinor: z.string().regex(/^\d+$/),
      currency: z.string().regex(/^[A-Z]{3}$/),
      financialUpdateAllowed: z.boolean(),
    }).strict(),
    z.object({
      kind: z.literal("authenticated_subscription_event"),
      apiVersion: z.enum(["v3", "v4"]),
      providerTransactionId: z.null(),
      status: identifier.nullable(),
      amountMinor: z.null(),
      currency: z.null(),
      financialUpdateAllowed: z.literal(false),
    }).strict(),
  ]),
}).strict().superRefine((value, context) => {
  if (!value.verification.financialUpdateAllowed) return;
  if (!value.ownership.txRef) context.addIssue({ code: "custom", message: "financial_tx_ref_missing", path: ["ownership", "txRef"] });
  if (!["successful", "succeeded"].includes(value.verification.status.toLowerCase())) context.addIssue({ code: "custom", message: "financial_status_invalid", path: ["verification", "status"] });
  if (BigInt(value.verification.amountMinor) <= 0n) context.addIssue({ code: "custom", message: "financial_amount_invalid", path: ["verification", "amountMinor"] });
});

export type SocialBoosterGatewayEnvelope = z.infer<typeof envelopeSchema>;

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function flutterwaveGatewayMode(env: NodeJS.ProcessEnv = process.env): GatewayMode {
  const value = String(env.FLUTTERWAVE_GATEWAY_MODE || "").trim().toLowerCase();
  return value === "shadow" || value === "enforce" ? value : "off";
}

function assertIndependentSecret(secret: string, env: NodeJS.ProcessEnv) {
  if (secret.length < 32) throw new Error("gateway_secret_invalid");
  const forbidden = [env.FLUTTERWAVE_SECRET_KEY, env.FLUTTERWAVE_WEBHOOK_SECRET_HASH].filter(Boolean);
  if (forbidden.some((value) => secureEqual(secret, String(value)))) throw new Error("gateway_secret_reuse_invalid");
}

function intentUrl(value: string, env: NodeJS.ProcessEnv) {
  const url = new URL("/api/intents", value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(env.NODE_ENV !== "production" && local)) throw new Error("gateway_url_invalid");
  if (url.username || url.password || url.hash) throw new Error("gateway_url_invalid");
  return url.toString();
}

export async function registerSocialBoosterIntent(input: {
  txRef: string;
  amountMinor: number;
  currency: "NGN";
}, options: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; nowMs?: number; nonce?: string } = {}) {
  const env = options.env ?? process.env;
  const registrationMode = flutterwaveGatewayMode(env);
  if (registrationMode === "off") return { mode: registrationMode, registered: false as const, skipped: true as const };

  try {
    const secret = String(env.FLUTTERWAVE_GATEWAY_REGISTRATION_SECRET || "").trim();
    const gatewayUrl = String(env.FLUTTERWAVE_GATEWAY_URL || "").trim();
    assertIndependentSecret(secret, env);
    if (!gatewayUrl) throw new Error("gateway_registration_not_configured");
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("gateway_amount_invalid");
    const nowMs = options.nowMs ?? Date.now();
    const timestamp = Math.floor(nowMs / 1000);
    const nonce = options.nonce ?? randomBytes(24).toString("base64url");
    const rawBody = JSON.stringify({
      internalEntityId: input.txRef,
      txRef: input.txRef,
      amount: (input.amountMinor / 100).toFixed(2),
      currency: input.currency,
      providerApiVersion: "v3",
      expectedSubaccountId: null,
      expiresAt: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
    });
    const signature = createHmac("sha256", secret).update(`${timestamp}.${nonce}.${rawBody}`).digest("base64");
    const response = await (options.fetchImpl ?? fetch)(intentUrl(gatewayUrl, env), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gateway-app-id": "social_booster",
        "x-gateway-timestamp": String(timestamp),
        "x-gateway-nonce": nonce,
        "x-gateway-signature": signature,
      },
      body: rawBody,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`gateway_registration_http_${response.status}`);
    return { mode: registrationMode, registered: true as const, skipped: false as const };
  } catch (error) {
    if (registrationMode === "enforce") throw error;
    return { mode: registrationMode, registered: false as const, skipped: false as const };
  }
}

export function verifySocialBoosterGatewayDelivery(input: {
  rawBody: string;
  headers: Pick<Headers, "get">;
  secret?: string;
  nowMs?: number;
  env?: NodeJS.ProcessEnv;
}) {
  const env = input.env ?? process.env;
  const secret = String(input.secret || "");
  try { assertIndependentSecret(secret, env); } catch { return { ok: false as const, reason: "secret_invalid" }; }
  if (Buffer.byteLength(input.rawBody, "utf8") > 64 * 1024) return { ok: false as const, reason: "payload_too_large" };
  const appId = input.headers.get("x-gateway-app-id");
  const timestampText = input.headers.get("x-gateway-timestamp");
  const deliveryId = input.headers.get("x-gateway-delivery-id");
  const signature = input.headers.get("x-gateway-signature");
  if (appId !== "social_booster" || !timestampText || !deliveryId || !signature) return { ok: false as const, reason: "headers_invalid" };
  if (!/^\d{10}$/.test(timestampText)) return { ok: false as const, reason: "timestamp_invalid" };
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor((input.nowMs ?? Date.now()) / 1000) - timestamp) > 300) return { ok: false as const, reason: "timestamp_expired" };
  const expected = createHmac("sha256", secret).update(`${timestamp}.${deliveryId}.${input.rawBody}`).digest("base64");
  if (!secureEqual(expected, signature)) return { ok: false as const, reason: "signature_invalid" };
  let parsed: unknown;
  try { parsed = JSON.parse(input.rawBody); } catch { return { ok: false as const, reason: "payload_invalid" }; }
  const envelope = envelopeSchema.safeParse(parsed);
  if (!envelope.success || envelope.data.deliveryId !== deliveryId) return { ok: false as const, reason: "payload_invalid" };
  return { ok: true as const, envelope: envelope.data };
}
