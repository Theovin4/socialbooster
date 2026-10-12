import type { OrderStatus } from "./order-status";

export const REFUND_CONFIRMATION_DELAY_MS = 5 * 60 * 1000;
const terminalStatuses = new Set<OrderStatus>(["failed", "cancelled", "partial"]);

type RefundDecisionInput = {
  status: OrderStatus;
  quantity: number;
  remains: number | null;
  previousObservation?: string | null;
  firstObservedAtMs?: number | null;
  nowMs: number;
};

export type RefundDecision = "none" | "stage" | "hold" | "confirm" | "reject";

export function remainingRefundAmount(originalChargeMinor: number, previousRefundsMinor: number[]) {
  if (!Number.isSafeInteger(originalChargeMinor) || originalChargeMinor <= 0) throw new Error("Invalid original charge");
  const refunded = previousRefundsMinor.reduce((sum, amount) => sum + (Number.isSafeInteger(amount) && amount > 0 ? amount : 0), 0);
  return Math.max(0, originalChargeMinor - Math.min(originalChargeMinor, refunded));
}

/** A terminal provider response must be valid and persist across two checks. */
export function terminalRefundDecision(input: RefundDecisionInput): RefundDecision {
  if (!terminalStatuses.has(input.status)) return "none";
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) return "reject";
  if (input.status === "partial" && (!Number.isSafeInteger(input.remains) || input.remains === null || input.remains <= 0 || input.remains >= input.quantity)) return "reject";
  if ((input.status === "failed" || input.status === "cancelled") && (!Number.isSafeInteger(input.remains) || input.remains !== input.quantity)) return "reject";
  if (input.previousObservation !== input.status || !input.firstObservedAtMs) return "stage";
  if (input.nowMs - input.firstObservedAtMs < REFUND_CONFIRMATION_DELAY_MS) return "hold";
  return "confirm";
}
