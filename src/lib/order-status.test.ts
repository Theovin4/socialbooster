import { describe, expect, it } from "vitest";
import { mapProviderStatus, verifiedProviderStatus } from "./order-status";

describe("provider status mapping", () => {
  it.each([["Pending", "pending"], ["In progress", "in_progress"], ["Completed", "completed"], ["Partial", "partial"], ["Canceled", "cancelled"], ["Error", "failed"]])("maps %s", (input, expected) => expect(mapProviderStatus(input)).toBe(expected));
  it("normalizes unknown active states safely", () => expect(mapProviderStatus("Queued")).toBe("processing"));
  it.each([["In Progress", "in_progress"], ["in-progress", "in_progress"], ["Cancelled", "cancelled"], ["Failed", "failed"], ["Complete", "completed"]])("normalizes common provider variant %s", (input, expected) => expect(mapProviderStatus(input)).toBe(expected));
});

describe("verified provider completion", () => {
  it("completes with zero remaining even when start count is absent", () => expect(verifiedProviderStatus("Completed", null, 0)).toBe("completed"));
  it("does not complete while units remain", () => expect(verifiedProviderStatus("Completed", 517, 499)).toBe("processing"));
  it("accepts completion only with numeric evidence", () => expect(verifiedProviderStatus("Completed", 517, 0)).toBe("completed"));
  it("accepts provider completion when a valid start count is the available quantity evidence", () => expect(verifiedProviderStatus("Complete", 517, null)).toBe("completed"));
  it("requires two separated matching observations when both quantities are absent", () => {
    expect(verifiedProviderStatus("Completed", null, null, { nowMs: 1_000_000 })).toBe("processing");
    expect(verifiedProviderStatus("Completed", null, null, { previousObservation: "completed", firstObservedAtMs: 1_000_000, nowMs: 1_000_001 })).toBe("processing");
    expect(verifiedProviderStatus("Completed", null, null, { previousObservation: "completed", firstObservedAtMs: 1_000_000, nowMs: 1_300_000 })).toBe("completed");
  });
});
