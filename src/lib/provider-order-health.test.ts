import { describe, expect, it } from "vitest";
import { nextProviderHealthState, providerAcceptsNewOrders, PROVIDER_AMBIGUOUS_WINDOW_MS } from "./provider-order-health";

describe("provider order health", () => {
  it("degrades after three ambiguous submissions in a short window", () => {
    const now = 1_000_000;
    const first = nextProviderHealthState({}, now);
    const second = nextProviderHealthState(first, now + 1_000);
    const third = nextProviderHealthState(second, now + 2_000);
    expect(third).toMatchObject({ status: "DEGRADED", ambiguousCount: 3, becameDegraded: true });
    expect(providerAcceptsNewOrders(third)).toBe(false);
  });

  it("starts a new window after the protection interval", () => {
    const next = nextProviderHealthState({ status: "ACTIVE", windowStartedAtMs: 1, ambiguousCount: 2 }, PROVIDER_AMBIGUOUS_WINDOW_MS + 2);
    expect(next).toMatchObject({ status: "ACTIVE", ambiguousCount: 1 });
  });
});
