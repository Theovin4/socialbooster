import { describe, expect, it } from "vitest";
import { productionFirestoreBlocked } from "./admin";

describe("production Firestore local guard", () => {
  it("blocks unapproved local and CI access", () => {
    expect(productionFirestoreBlocked({ NODE_ENV: "development" })).toBe(true);
    expect(productionFirestoreBlocked({ CI: "true" })).toBe(true);
  });

  it("allows the emulator, an explicit maintenance override, and Vercel", () => {
    expect(productionFirestoreBlocked({ FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" })).toBe(false);
    expect(productionFirestoreBlocked({ ALLOW_PRODUCTION_FIRESTORE: "true" })).toBe(false);
    expect(productionFirestoreBlocked({ VERCEL_ENV: "production" })).toBe(false);
  });
});
