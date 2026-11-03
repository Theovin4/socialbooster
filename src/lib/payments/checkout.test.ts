import { describe, expect, it } from "vitest";
import { flutterwaveReferenceForRequest, isAlreadyExistsError } from "./checkout";

describe("Flutterwave checkout request identity", () => {
  it("creates a deterministic non-customer-controlled provider reference", () => {
    const first = flutterwaveReferenceForRequest("user-1", "0386da91-7494-478e-8949-0f3383749fcc");
    expect(first).toMatch(/^flw_[a-f0-9]{40}$/);
    expect(flutterwaveReferenceForRequest("user-1", "0386da91-7494-478e-8949-0f3383749fcc")).toBe(first);
    expect(flutterwaveReferenceForRequest("user-2", "0386da91-7494-478e-8949-0f3383749fcc")).not.toBe(first);
  });
  it("rejects malformed request identities", () => expect(() => flutterwaveReferenceForRequest("user-1", "not-a-uuid")).toThrow());
  it("recognizes Firestore already-exists variants without swallowing other errors", () => {
    expect(isAlreadyExistsError({ code: 6 })).toBe(true);
    expect(isAlreadyExistsError({ code: "already-exists" })).toBe(true);
    expect(isAlreadyExistsError({ code: "permission-denied" })).toBe(false);
  });
});
