import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { flutterwaveGatewayMode, registerSocialBoosterIntent, verifySocialBoosterGatewayDelivery } from "./gateway";

const secret = "social-booster-delivery-secret-for-tests";
const nowMs = 1_800_000_000_000;

function delivery(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1, deliveryId: "delivery-1", eventId: "event-1", applicationId: "social_booster", eventType: "charge.completed",
    internalEntityId: "flw_reference_12345678", ownership: { source: "intent", txRef: "flw_reference_12345678", providerSubscriptionId: null },
    verification: { kind: "provider_transaction", apiVersion: "v3", providerTransactionId: "2111150666", status: "successful", amountMinor: "20000", currency: "NGN", financialUpdateAllowed: true },
    ...overrides,
  };
}

function signedHeaders(rawBody: string, timestamp = Math.floor(nowMs / 1000), deliveryId = "delivery-1", appId = "social_booster") {
  return new Headers({ "x-gateway-app-id": appId, "x-gateway-timestamp": String(timestamp), "x-gateway-delivery-id": deliveryId, "x-gateway-signature": createHmac("sha256", secret).update(`${timestamp}.${deliveryId}.${rawBody}`).digest("base64") });
}

describe("Social Booster shared Flutterwave gateway registration", () => {
  it("defaults to off and performs no network call", async () => {
    const fetchImpl = vi.fn();
    expect(flutterwaveGatewayMode({} as NodeJS.ProcessEnv)).toBe("off");
    await expect(registerSocialBoosterIntent({ txRef: "flw_reference_12345678", amountMinor: 20_000, currency: "NGN" }, { env: {} as NodeJS.ProcessEnv, fetchImpl: fetchImpl as typeof fetch })).resolves.toMatchObject({ mode: "off", skipped: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("registers the server-owned intent before checkout in enforce mode", async () => {
    let body = "", headers = new Headers();
    const result = await registerSocialBoosterIntent({ txRef: "flw_reference_12345678", amountMinor: 20_000, currency: "NGN" }, {
      env: { NODE_ENV: "test", FLUTTERWAVE_GATEWAY_MODE: "enforce", FLUTTERWAVE_GATEWAY_URL: "https://gateway.example.test", FLUTTERWAVE_GATEWAY_REGISTRATION_SECRET: secret } as NodeJS.ProcessEnv,
      nowMs, nonce: "social_booster_nonce_123456", fetchImpl: (async (_input: RequestInfo | URL, init?: RequestInit) => { body = String(init?.body); headers = new Headers(init?.headers); return new Response(null, { status: 201 }); }) as typeof fetch,
    });
    expect(result.registered).toBe(true);
    expect(JSON.parse(body)).toMatchObject({ internalEntityId: "flw_reference_12345678", amount: "200.00", currency: "NGN", providerApiVersion: "v3", expectedSubaccountId: null });
    expect(headers.get("x-gateway-app-id")).toBe("social_booster");
    expect(headers.get("x-gateway-signature")).not.toBe(secret);
  });

  it("fails closed in enforce mode and preserves checkout continuity in shadow mode", async () => {
    const failedFetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 })) as typeof fetch;
    const base = { NODE_ENV: "test", FLUTTERWAVE_GATEWAY_URL: "https://gateway.example.test", FLUTTERWAVE_GATEWAY_REGISTRATION_SECRET: secret } as NodeJS.ProcessEnv;
    await expect(registerSocialBoosterIntent({ txRef: "flw_reference_12345678", amountMinor: 20_000, currency: "NGN" }, { env: { ...base, FLUTTERWAVE_GATEWAY_MODE: "enforce" }, fetchImpl: failedFetch })).rejects.toThrow("gateway_registration_http_503");
    await expect(registerSocialBoosterIntent({ txRef: "flw_reference_12345678", amountMinor: 20_000, currency: "NGN" }, { env: { ...base, FLUTTERWAVE_GATEWAY_MODE: "shadow" }, fetchImpl: failedFetch })).resolves.toMatchObject({ mode: "shadow", registered: false });
  });

  it("rejects a gateway secret reused from Flutterwave", async () => {
    const env = { NODE_ENV: "test", FLUTTERWAVE_GATEWAY_MODE: "enforce", FLUTTERWAVE_GATEWAY_URL: "https://gateway.example.test", FLUTTERWAVE_GATEWAY_REGISTRATION_SECRET: secret, FLUTTERWAVE_WEBHOOK_SECRET_HASH: secret } as NodeJS.ProcessEnv;
    await expect(registerSocialBoosterIntent({ txRef: "flw_reference_12345678", amountMinor: 20_000, currency: "NGN" }, { env })).rejects.toThrow("gateway_secret_reuse_invalid");
  });
});

describe("Social Booster shared Flutterwave gateway delivery", () => {
  it("accepts only an authentic, current, application-bound delivery", () => {
    const rawBody = JSON.stringify(delivery()), headers = signedHeaders(rawBody);
    expect(verifySocialBoosterGatewayDelivery({ rawBody, headers, secret, nowMs }).ok).toBe(true);
    expect(verifySocialBoosterGatewayDelivery({ rawBody: `${rawBody} `, headers, secret, nowMs })).toEqual({ ok: false, reason: "signature_invalid" });
    expect(verifySocialBoosterGatewayDelivery({ rawBody, headers, secret, nowMs: nowMs + 301_000 })).toEqual({ ok: false, reason: "timestamp_expired" });
  });

  it("rejects a different application, delivery ID or missing headers", () => {
    const rawBody = JSON.stringify(delivery());
    expect(verifySocialBoosterGatewayDelivery({ rawBody, headers: signedHeaders(rawBody, Math.floor(nowMs / 1000), "delivery-1", "apply"), secret, nowMs })).toMatchObject({ ok: false });
    expect(verifySocialBoosterGatewayDelivery({ rawBody, headers: signedHeaders(rawBody, Math.floor(nowMs / 1000), "delivery-2"), secret, nowMs })).toEqual({ ok: false, reason: "payload_invalid" });
    expect(verifySocialBoosterGatewayDelivery({ rawBody, headers: new Headers(), secret, nowMs })).toEqual({ ok: false, reason: "headers_invalid" });
  });

  it("rejects financial delivery without successful provider evidence", () => {
    const invalid = delivery({ verification: { kind: "provider_transaction", apiVersion: "v3", providerTransactionId: "2111150666", status: "failed", amountMinor: "20000", currency: "NGN", financialUpdateAllowed: true } });
    const rawBody = JSON.stringify(invalid);
    expect(verifySocialBoosterGatewayDelivery({ rawBody, headers: signedHeaders(rawBody), secret, nowMs })).toEqual({ ok: false, reason: "payload_invalid" });
  });

  it("accepts authenticated non-financial state events without enabling credit", () => {
    const state = delivery({ verification: { kind: "provider_transaction", apiVersion: "v3", providerTransactionId: "2111150666", status: "failed", amountMinor: "20000", currency: "NGN", financialUpdateAllowed: false } });
    const rawBody = JSON.stringify(state);
    const result = verifySocialBoosterGatewayDelivery({ rawBody, headers: signedHeaders(rawBody), secret, nowMs });
    expect(result.ok && result.envelope.verification.financialUpdateAllowed).toBe(false);
  });

  it("rejects oversized payloads and invalid or reused secrets", () => {
    const rawBody = JSON.stringify(delivery()), headers = signedHeaders(rawBody);
    expect(verifySocialBoosterGatewayDelivery({ rawBody: "x".repeat(65 * 1024), headers, secret, nowMs })).toEqual({ ok: false, reason: "payload_too_large" });
    expect(verifySocialBoosterGatewayDelivery({ rawBody, headers, secret: "short", nowMs })).toEqual({ ok: false, reason: "secret_invalid" });
    expect(verifySocialBoosterGatewayDelivery({ rawBody, headers, secret, nowMs, env: { NODE_ENV: "test", FLUTTERWAVE_SECRET_KEY: secret } as NodeJS.ProcessEnv })).toEqual({ ok: false, reason: "secret_invalid" });
  });
});
