import { describe, expect, it } from "vitest";
import { REFUND_CONFIRMATION_DELAY_MS, terminalRefundDecision } from "./order-refund-policy";

describe("terminal refund confirmation", () => {
  const now = 1_000_000;
  it("does nothing for an active order", () => expect(terminalRefundDecision({ status: "processing", quantity: 1000, remains: 500, nowMs: now })).toBe("none"));
  it("stages the first terminal provider response", () => expect(terminalRefundDecision({ status: "failed", quantity: 1000, remains: 1000, nowMs: now })).toBe("stage"));
  it("holds an immediate repeat", () => expect(terminalRefundDecision({ status: "cancelled", quantity: 1000, remains: 1000, previousObservation: "cancelled", firstObservedAtMs: now - 1000, nowMs: now })).toBe("hold"));
  it("confirms a stable terminal response after the safety window", () => expect(terminalRefundDecision({ status: "failed", quantity: 1000, remains: 1000, previousObservation: "failed", firstObservedAtMs: now - REFUND_CONFIRMATION_DELAY_MS, nowMs: now })).toBe("confirm"));
  it("rejects malformed partial evidence", () => expect(terminalRefundDecision({ status: "partial", quantity: 1000, remains: 1000, nowMs: now })).toBe("reject"));
  it("rejects a full-refund status without a fully undelivered quantity", () => expect(terminalRefundDecision({ status: "failed", quantity: 1000, remains: null, nowMs: now })).toBe("reject"));
  it("confirms a valid partial result", () => expect(terminalRefundDecision({ status: "partial", quantity: 1000, remains: 250, previousObservation: "partial", firstObservedAtMs: now - REFUND_CONFIRMATION_DELAY_MS, nowMs: now })).toBe("confirm"));
});
