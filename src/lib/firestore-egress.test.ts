import { describe, expect, it } from "vitest";
import { approximateFirestoreValueBytes, summarizePayloadBytes } from "./firestore-egress";

describe("Firestore egress estimates", () => {
  it("counts binary values by their actual byte length", () => {
    expect(approximateFirestoreValueBytes({ bytes: Buffer.alloc(150_000) })).toBeGreaterThanOrEqual(150_000);
    expect(approximateFirestoreValueBytes({ bytes: Buffer.alloc(150_000) })).toBeLessThan(151_000);
  });

  it("summarizes bounded document payloads", () => {
    expect(summarizePayloadBytes([{ value: "a" }, { value: "longer" }])).toMatchObject({ documentCount: 2 });
    expect(summarizePayloadBytes([{ value: "a" }, { value: "longer" }]).largestBytes).toBeGreaterThan(0);
  });
});
