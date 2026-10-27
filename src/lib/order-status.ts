export type OrderStatus="pending"|"processing"|"in_progress"|"completed"|"partial"|"cancelled"|"failed";
const statuses:Record<string,OrderStatus>={pending:"pending",processing:"processing","in progress":"in_progress",in_progress:"in_progress","in-progress":"in_progress",completed:"completed",complete:"completed",partial:"partial",canceled:"cancelled",cancelled:"cancelled",error:"failed",fail:"failed",failed:"failed"};
export function mapProviderStatus(value:string):OrderStatus{return statuses[value.trim().toLowerCase()]||"processing"}

export const COMPLETION_CONFIRMATION_DELAY_MS = 5 * 60 * 1000;

export function verifiedProviderStatus(
  value: string,
  startCount: number | null,
  remains: number | null,
  confirmation?: { previousObservation?: string | null; firstObservedAtMs?: number | null; nowMs?: number },
): OrderStatus {
  const mapped = mapProviderStatus(value);
  if (mapped !== "completed") return mapped;
  if (remains === 0) return "completed";
  if (remains !== null && remains > 0) return "processing";
  if (startCount !== null) return "completed";
  const firstObservedAtMs = confirmation?.firstObservedAtMs || 0;
  const nowMs = confirmation?.nowMs || 0;
  if (confirmation?.previousObservation === "completed" && firstObservedAtMs > 0 && nowMs - firstObservedAtMs >= COMPLETION_CONFIRMATION_DELAY_MS) return "completed";
  // A schema that omits both quantities needs two matching observations.
  if (startCount === null && remains === null) return "processing";
  return mapped;
}
