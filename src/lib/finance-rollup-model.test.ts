import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FinanceOrder, FinanceTransaction } from "./finance";
import {
  FINANCE_ROLLUP_VERSION,
  addOrderToDailyMetrics,
  addOrderToFinanceMetrics,
  addTransactionToFinanceMetrics,
  emptyFinanceMetrics,
  newDailyMetrics,
  orderStatusTransitionDelta,
  summaryForStatus,
} from "./finance-rollup-model";

const accepted: FinanceOrder = {
  id: "accepted",
  createdAt: new Date("2026-10-14T10:00:00.000Z"),
  status: "pending",
  serviceName: "Service",
  category: "Instagram",
  quantity: 1_000,
  customerPriceMinor: 166_667,
  providerCostMinor: 100_000,
  grossProfitMinor: 66_667,
  providerOrderId: 91,
  providerAccepted: true,
  providerCostIncurredMinor: 100_000,
};

const refund: FinanceTransaction = {
  id: "refund:accepted",
  createdAt: new Date("2026-10-14T11:00:00.000Z"),
  type: "refund",
  deltaMinor: 166_667,
  currency: "NGN",
  reference: "accepted",
};

describe("finance rollup model", () => {
  it("uses finance rollup schema version 2", () => {
    expect(FINANCE_ROLLUP_VERSION).toBe(2);
  });

  it("rebuilds deterministic totals without incrementing prior state", () => {
    const calculate = () => {
      const totals = emptyFinanceMetrics();
      addOrderToFinanceMetrics(totals, accepted);
      addTransactionToFinanceMetrics(totals, refund);
      return totals;
    };
    expect(calculate()).toEqual(calculate());
    expect(calculate()).toMatchObject({ orderCount: 1, orderValueMinor: 166_667, capitalDeployedMinor: 100_000, refundsMinor: 166_667 });
  });

  it("keeps complete per-status order totals inside each daily record", () => {
    const day = newDailyMetrics("2026-10-14");
    addOrderToDailyMetrics(day, accepted);
    addTransactionToFinanceMetrics(day, refund);
    expect(summaryForStatus(day, "pending")).toMatchObject({ orderCount: 1, orderValueMinor: 166_667, capitalDeployedMinor: 100_000 });
    expect(summaryForStatus(day, "completed")).toMatchObject({ orderCount: 0, orderValueMinor: 0, capitalDeployedMinor: 0 });
  });

  it("keeps deposits and refunds separate from order value", () => {
    const totals = emptyFinanceMetrics();
    addTransactionToFinanceMetrics(totals, { ...refund, id: "deposit", type: "deposit", deltaMinor: 200_000 });
    addTransactionToFinanceMetrics(totals, refund);
    expect(totals).toMatchObject({ orderValueMinor: 0, depositsMinor: 200_000, refundsMinor: 166_667 });
  });

  it("balances legitimate repeated status cycles", () => {
    expect(orderStatusTransitionDelta("in_progress", "partial", 40_000)).toEqual({
      activeOrders: -1,
      activeCapitalMinor: -40_000,
      completedOrders: 0,
      failedOrders: 0,
    });
    expect(orderStatusTransitionDelta("partial", "in_progress", 40_000)).toEqual({
      activeOrders: 1,
      activeCapitalMinor: 40_000,
      completedOrders: 0,
      failedOrders: 0,
    });
    expect(orderStatusTransitionDelta("in_progress", "partial", 40_000).activeCapitalMinor).toBe(-40_000);
  });
});

describe("finance query architecture", () => {
  it("never runs a multi-field aggregate bootstrap during a page request", () => {
    const rollups = readFileSync(new URL("./firebase/analytics-rollups.ts", import.meta.url), "utf8");
    const page = readFileSync(new URL("../app/admin/finance/page.tsx", import.meta.url), "utf8");
    expect(rollups).not.toContain("AggregateField");
    expect(page).not.toContain("ensureFinanceRollups");
    expect(rollups).toContain("Historical repair is never run from a page request");
  });

  it("records provider capital only in the provider-accepted event", () => {
    const rollups = readFileSync(new URL("./firebase/analytics-rollups.ts", import.meta.url), "utf8");
    const orders = readFileSync(new URL("./orders.ts", import.meta.url), "utf8");
    const created = rollups.slice(rollups.indexOf("recordFinanceOrderCreated"), rollups.indexOf("recordWalletRollup"));
    expect(created).not.toContain("capitalDeployedMinor");
    expect(rollups).toContain("order_provider_accepted_");
    expect(orders).toContain("recordFinanceProviderAccepted");
  });
});
