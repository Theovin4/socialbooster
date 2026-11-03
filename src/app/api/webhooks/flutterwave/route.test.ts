import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  credit: vi.fn(),
  authenticate: vi.fn(),
  verify: vi.fn(),
  writes: [] as Array<{ path: string; data: Record<string, unknown> }>,
}));

vi.mock("@/lib/payments/credit", () => ({ creditVerifiedPayment: mocks.credit }));
vi.mock("@/lib/payments/flutterwave", () => ({ verifyFlutterwaveWebhookAuthentication: mocks.authenticate, verifyFlutterwaveTransaction: mocks.verify }));
vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => ({ collection: (collection: string) => ({ doc: (id: string) => ({ set: async (data: Record<string, unknown>) => { mocks.writes.push({ path: `${collection}/${id}`, data }); } }) }) }) }));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("https://socialbooster.test/api/webhooks/flutterwave", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "verif-hash": "synthetic" } });
}

describe("direct Flutterwave webhook payment safety", () => {
  beforeEach(() => {
    mocks.credit.mockReset().mockResolvedValue({ duplicate: false });
    mocks.authenticate.mockReset().mockReturnValue(true);
    mocks.verify.mockReset().mockResolvedValue({ id: 123, status: "successful", amount: 200, currency: "NGN", tx_ref: "flw_reference_12345678" });
    mocks.writes.length = 0;
  });

  it("credits only a provider-verified successful charge completion", async () => {
    const response = await POST(request({ event: "charge.completed", data: { id: 123, tx_ref: "flw_reference_12345678" } }));
    expect(response.status).toBe(200);
    expect(mocks.credit).toHaveBeenCalledWith(expect.objectContaining({ providerTransactionId: "123", amountMinor: 20_000, source: "direct_webhook" }));
  });

  it("acknowledges a duplicate webhook while relying on the atomic finalizer's idempotency result", async () => {
    mocks.credit.mockResolvedValueOnce({ duplicate: false }).mockResolvedValueOnce({ duplicate: true });
    const body = { event: "charge.completed", data: { id: 123, tx_ref: "flw_reference_12345678" } };
    const first = await POST(request(body));
    const duplicate = await POST(request(body));
    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(mocks.credit).toHaveBeenCalledTimes(2);
  });

  it.each(["failed", "pending"])("does not credit a %s provider transaction", async (status) => {
    mocks.verify.mockResolvedValue({ id: 123, status, amount: 200, currency: "NGN", tx_ref: "flw_reference_12345678" });
    const response = await POST(request({ event: "charge.completed", data: { id: 123 } }));
    expect(response.status).toBe(200);
    expect(mocks.credit).not.toHaveBeenCalled();
    expect(mocks.writes.some((write) => write.path.includes(`flutterwave-state:123:${status}`))).toBe(true);
  });

  it("records a refund for review without treating it as a credit", async () => {
    const response = await POST(request({ event: "refund.completed", data: { id: 123, tx_ref: "flw_reference_12345678" } }));
    expect(response.status).toBe(200);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.credit).not.toHaveBeenCalled();
    expect(mocks.writes.some((write) => write.path.startsWith("fraudAlerts/"))).toBe(true);
  });

  it("rejects unauthenticated events before provider verification", async () => {
    mocks.authenticate.mockReturnValue(false);
    const response = await POST(request({ event: "charge.completed", data: { id: 123 } }));
    expect(response.status).toBe(401);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.credit).not.toHaveBeenCalled();
  });
});
