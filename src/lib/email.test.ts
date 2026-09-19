import { afterEach, describe, expect, it, vi } from "vitest";
import { sendBrandedEmail } from "./email";

const originalKey = process.env.RESEND_API_KEY;
const originalFrom = process.env.EMAIL_FROM;

afterEach(() => {
  vi.unstubAllGlobals();
  process.env.RESEND_API_KEY = originalKey;
  process.env.EMAIL_FROM = originalFrom;
});

describe("sendBrandedEmail", () => {
  it("returns the accepted Resend message id without copying security mail", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Social Booster <support@socialbooster.net.ng>";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email_123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendBrandedEmail({ to: "customer@example.com", subject: "Verify", html: "<p>Verify</p>", idempotencyKey: "verify-user-1" })).resolves.toEqual({ id: "email_123" });
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ to: ["customer@example.com"], subject: "Verify" });
    expect(JSON.parse(String(request.body))).not.toHaveProperty("bcc");
  });

  it("retries transient provider errors", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Social Booster <support@socialbooster.net.ng>";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "temporary" }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "email_456" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendBrandedEmail({ to: "customer@example.com", subject: "Verify", html: "<p>Verify</p>" })).resolves.toEqual({ id: "email_456" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws when Resend rejects the message so callers can use a fallback", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Social Booster <support@socialbooster.net.ng>";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 })));

    await expect(sendBrandedEmail({ to: "customer@example.com", subject: "Verify", html: "<p>Verify</p>" })).rejects.toThrow("domain not verified");
  });
});
