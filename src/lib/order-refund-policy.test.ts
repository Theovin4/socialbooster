import { describe, expect, it } from "vitest";
import { genericActiveProviderRefundBlocked, REFUND_CONFIRMATION_DELAY_MS, remainingRefundAmount, statusDuringRefundConfirmation, terminalRefundDecision } from "./order-refund-policy";
import { serviceCostMinor } from "./money";

describe("terminal refund confirmation", () => {
  const now = 1_000_000;
  it("does nothing for an active order", () => expect(terminalRefundDecision({ status: "processing", quantity: 1000, remains: 500, nowMs: now })).toBe("none"));
  it("stages the first terminal provider response", () => expect(terminalRefundDecision({ status: "failed", quantity: 1000, remains: 1000, nowMs: now })).toBe("stage"));
  it("holds an immediate repeat", () => expect(terminalRefundDecision({ status: "cancelled", quantity: 1000, remains: 1000, previousObservation: "cancelled", firstObservedAtMs: now - 1000, nowMs: now })).toBe("hold"));
  it("confirms a stable terminal response after the safety window", () => expect(terminalRefundDecision({ status: "failed", quantity: 1000, remains: 1000, previousObservation: "failed", firstObservedAtMs: now - REFUND_CONFIRMATION_DELAY_MS, nowMs: now })).toBe("confirm"));
  it("rejects malformed partial evidence", () => expect(terminalRefundDecision({ status: "partial", quantity: 1000, remains: 1000, nowMs: now })).toBe("reject"));
  it("rejects a full-refund status without a fully undelivered quantity", () => expect(terminalRefundDecision({ status: "failed", quantity: 1000, remains: null, nowMs: now })).toBe("reject"));
  it("confirms a valid partial result", () => expect(terminalRefundDecision({ status: "partial", quantity: 1000, remains: 250, previousObservation: "partial", firstObservedAtMs: now - REFUND_CONFIRMATION_DELAY_MS, nowMs: now })).toBe("confirm"));
  it("shows a valid partial result immediately while its refund remains staged", () => {
    expect(statusDuringRefundConfirmation("partial", "pending", "stage")).toBe("partial");
    expect(statusDuringRefundConfirmation("partial", "partial", "hold")).toBe("partial");
  });
  it("refunds only the undelivered quantity at the customer selling rate", () => {
    expect(serviceCostMinor(14_000n, 250n)).toBe(3_500n);
    expect(remainingRefundAmount(14_000, [3_500])).toBe(10_500);
  });
});

describe("cross-source refund protection", () => {
  it("blocks a generic refund for every active provider-backed order", () => {
    for (const status of ["pending", "processing", "in_progress", "cancel_requested"]) expect(genericActiveProviderRefundBlocked(status, 123)).toBe(true);
    expect(genericActiveProviderRefundBlocked("partial", 123)).toBe(false);
    expect(genericActiveProviderRefundBlocked("pending", null)).toBe(false);
  });
  it("only permits the unrefunded portion and never exceeds the charge", () => {
    expect(remainingRefundAmount(10_000, [2_500])).toBe(7_500);
    expect(remainingRefundAmount(10_000, [6_000, 6_000])).toBe(0);
  });
  it("subtracts an existing manual credit from a later proportional refund", () => {
    expect(remainingRefundAmount(3_500, [1_000])).toBe(2_500);
  });
});
