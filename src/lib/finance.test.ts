import { describe, expect, it } from "vitest";
import { financePeriod, financeSummary, type FinanceOrder } from "./finance";

function order(overrides: Partial<FinanceOrder> = {}): FinanceOrder {
  return {
    id: "1",
    createdAt: new Date("2026-10-14T10:00:00.000Z"),
    status: "pending",
    serviceName: "Likes",
    category: "Facebook",
    quantity: 100,
    customerPriceMinor: 166_667,
    providerCostMinor: 100_000,
    grossProfitMinor: 66_667,
    ...overrides,
  };
}

describe("financeSummary", () => {
  it("separates deposits, liabilities, sales, capital and profit", () => {
    const result = financeSummary(
      [order({ status: "completed", customerPriceMinor: 14000, providerCostMinor: 10000, grossProfitMinor: 4000, providerOrderId: 9 })],
      [
        { id: "d", createdAt: new Date(), type: "deposit", deltaMinor: 20000, currency: "NGN" },
        { id: "r", createdAt: new Date(), type: "refund", deltaMinor: 2000, currency: "NGN" },
      ],
      6000,
    );
    expect(result).toMatchObject({ depositsMinor: 20000, orderValueMinor: 14000, refundsMinor: 2000, netSalesMinor: 12000, capitalDeployedMinor: 10000, grossProfitMinor: 2000, walletLiabilityMinor: 6000 });
  });

  it("does not deploy provider capital when an order is rejected before acceptance", () => {
    const result = financeSummary(
      [order({ status: "failed" })],
      [{ id: "refund", createdAt: new Date(), type: "refund", deltaMinor: 166_667, currency: "NGN" }],
      166_667,
    );
    expect(result).toMatchObject({ orderValueMinor: 166_667, refundsMinor: 166_667, netSalesMinor: 0, capitalDeployedMinor: 0, grossProfitMinor: 0 });
  });

  it("records capital only after provider acceptance", () => {
    const result = financeSummary([order({ providerOrderId: 81, providerAccepted: true, providerCostIncurredMinor: 100_000 })], [], 0);
    expect(result).toMatchObject({ capitalDeployedMinor: 100_000, activeCapitalMinor: 100_000, grossProfitMinor: 66_667 });
  });

  it("keeps unrecovered provider cost after a full customer refund", () => {
    const result = financeSummary(
      [order({ status: "refunded", providerOrderId: 82, providerAccepted: true, providerCostIncurredMinor: 100_000 })],
      [{ id: "refund", createdAt: new Date(), type: "refund", deltaMinor: 166_667, currency: "NGN" }],
      0,
    );
    expect(result).toMatchObject({ netSalesMinor: 0, capitalDeployedMinor: 100_000, activeCapitalMinor: 0, grossProfitMinor: -100_000 });
  });

  it("supports partial refunds without erasing provider cost", () => {
    const result = financeSummary(
      [order({ status: "partial", providerOrderId: 83 })],
      [{ id: "refund", createdAt: new Date(), type: "refund", deltaMinor: 50_000, currency: "NGN" }],
      0,
    );
    expect(result).toMatchObject({ netSalesMinor: 116_667, capitalDeployedMinor: 100_000, grossProfitMinor: 16_667 });
  });
});

describe("financePeriod", () => {
  const now = new Date("2026-01-01T23:30:00.000Z"); // 00:30 on 2 January in Lagos.

  it("supports all-time reporting", () => expect(financePeriod({ range: "all" }, now).start).toBeNull());

  it("uses the current Lagos calendar day for Today", () => {
    const period = financePeriod({ range: "today" }, now);
    expect(period.start?.toISOString()).toBe("2026-01-01T23:00:00.000Z");
    expect(period.end.toISOString()).toBe(now.toISOString());
  });

  it.each([
    ["7d", "2025-12-26T23:00:00.000Z"],
    ["30d", "2025-12-03T23:00:00.000Z"],
    ["90d", "2025-10-04T23:00:00.000Z"],
  ])("defines %s as today plus the preceding calendar days", (range, expected) => {
    expect(financePeriod({ range }, now).start?.toISOString()).toBe(expected);
  });

  it("uses Lagos boundaries for custom dates across a year boundary", () => {
    const period = financePeriod({ from: "2025-12-31", to: "2026-01-02" }, now);
    expect(period.start?.toISOString()).toBe("2025-12-30T23:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-01-02T22:59:59.999Z");
  });
});
