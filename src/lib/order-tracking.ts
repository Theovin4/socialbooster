import type { OrderStatus } from "./order-status";

export type OrderProgress = {
  delivered: number | null;
  remaining: number | null;
  percent: number | null;
};

export function nonNegativeInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** The single authoritative delivery-progress calculation used by persistence and UI. */
export function orderProgress(input: {
  quantity: unknown;
  remains: unknown;
  status: OrderStatus | string | unknown;
}): OrderProgress {
  const quantity = nonNegativeInteger(input.quantity);
  if (quantity === null || quantity <= 0) return { delivered: null, remaining: null, percent: null };
  if (String(input.status) === "completed") return { delivered: quantity, remaining: 0, percent: 100 };
  const remains = nonNegativeInteger(input.remains);
  if (remains === null) return { delivered: null, remaining: null, percent: null };
  const boundedRemaining = Math.min(quantity, remains);
  const delivered = quantity - boundedRemaining;
  return {
    delivered,
    remaining: boundedRemaining,
    percent: Math.max(0, Math.min(100, Math.round((delivered * 100) / quantity))),
  };
}
