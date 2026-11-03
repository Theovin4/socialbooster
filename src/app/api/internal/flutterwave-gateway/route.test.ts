import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({ adminDb: vi.fn() }));
vi.mock("@/lib/payments/credit", () => ({ creditVerifiedPayment: vi.fn() }));

import { POST } from "./route";

describe("shared Flutterwave gateway adapter", () => {
  beforeEach(() => {
    vi.stubEnv("FLUTTERWAVE_GATEWAY_MODE", "off");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects all gateway deliveries while the mode is off", async () => {
    const request = new Request("https://socialbooster.test/api/internal/flutterwave-gateway", { method: "POST", body: "{}" });
    const response = await POST(request);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "gateway_disabled" });
  });
});
