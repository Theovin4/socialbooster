export type OrderStatus="pending"|"processing"|"in_progress"|"completed"|"partial"|"cancelled"|"failed";
const statuses:Record<string,OrderStatus>={pending:"pending",processing:"processing","in progress":"in_progress",in_progress:"in_progress",completed:"completed",partial:"partial",canceled:"cancelled",cancelled:"cancelled",error:"failed",fail:"failed",failed:"failed"};
export function mapProviderStatus(value:string):OrderStatus{return statuses[value.trim().toLowerCase()]||"processing"}

export function verifiedProviderStatus(value: string, startCount: number | null, remains: number | null): OrderStatus {
  const mapped = mapProviderStatus(value);
  if (mapped === "completed" && (startCount === null || remains !== 0)) return "processing";
  return mapped;
}
