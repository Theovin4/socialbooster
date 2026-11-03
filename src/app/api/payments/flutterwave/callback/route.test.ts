import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  credit: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("@/lib/payments/credit", () => ({ creditVerifiedPayment: mocks.credit }));
vi.mock("@/lib/payments/flutterwave", () => ({ verifyFlutterwaveTransaction: mocks.verify }));
vi.mock("@/lib/firebase/admin", () => ({ adminDb: vi.fn() }));

import { GET } from "./route";

describe("Flutterwave browser callback", () => {
  beforeEach(() => {
    mocks.credit.mockReset().mockResolvedValue({ duplicate: false });
    mocks.verify.mockReset().mockResolvedValue({ id: 123, status: "successful", amount: 200, currency: "NGN", tx_ref: "flw_reference_12345678" });
  });

  it("verifies and sends a successful callback through the shared atomic finalizer", async () => {
    const request = new Request("https://socialbooster.test/api/payments/flutterwave/callback?transaction_id=123&tx_ref=flw_reference_12345678");
    const response = await GET(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("payment=success");
    expect(mocks.credit).toHaveBeenCalledWith(expect.objectContaining({
      provider: "flutterwave",
      providerTransactionId: "123",
      reference: "flw_reference_12345678",
      amountMinor: 20_000,
      currency: "NGN",
      source: "browser_callback",
    }));
  });
});
