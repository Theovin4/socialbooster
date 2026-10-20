import { describe, expect, it } from "vitest";
import { nonNegativeInteger, orderProgress } from "./order-tracking";

describe("authoritative order progress", () => {
  it("calculates delivered quantity and clamps progress", () => {
    expect(orderProgress({ quantity: 1_000, remains: 250, status: "partial" })).toEqual({ delivered: 750, remaining: 250, percent: 75 });
    expect(orderProgress({ quantity: 1_000, remains: 2_000, status: "processing" })).toEqual({ delivered: 0, remaining: 1_000, percent: 0 });
  });

  it("always presents verified completed orders as fully delivered", () => {
    expect(orderProgress({ quantity: 1_000, remains: 20, status: "completed" })).toEqual({ delivered: 1_000, remaining: 0, percent: 100 });
  });

  it("does not fabricate progress without provider evidence", () => {
    expect(orderProgress({ quantity: 1_000, remains: null, status: "processing" })).toEqual({ delivered: null, remaining: null, percent: null });
    expect(nonNegativeInteger("unknown")).toBeNull();
  });
});
