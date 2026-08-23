import { describe, expect, it } from "vitest";
import { financePeriod, financeSummary } from "./finance";

describe("financeSummary", () => {
  it("separates deposits, liabilities, sales, capital and profit", () => {
    const result = financeSummary([{ id: "1", createdAt: new Date(), status: "completed", serviceName: "Likes", category: "Facebook", quantity: 100, customerPriceMinor: 14000, providerCostMinor: 10000, grossProfitMinor: 4000, providerOrderId: 9 }], [{ id: "d", createdAt: new Date(), type: "deposit", deltaMinor: 20000, currency: "NGN" }, { id: "r", createdAt: new Date(), type: "refund", deltaMinor: 2000, currency: "NGN" }], 6000);
    expect(result).toMatchObject({ depositsMinor: 20000, orderValueMinor: 14000, refundsMinor: 2000, netSalesMinor: 12000, capitalDeployedMinor: 10000, grossProfitMinor: 2000, walletLiabilityMinor: 6000 });
  });
});

describe("financePeriod", () => { it("supports all-time reporting", () => expect(financePeriod({ range: "all" }).start).toBeNull()); });
