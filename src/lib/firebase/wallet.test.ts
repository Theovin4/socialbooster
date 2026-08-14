import { describe, expect, it } from "vitest";
import { validateWalletEntry } from "./wallet";

const valid = { userId: "firebase-user-123", type: "admin_adjustment" as const, deltaMinor: 1000, currency: "USD", idempotencyKey: "admin:user:12345678", reason: "Approved test credit", actorUid: "admin-user" };
describe("wallet validation", () => {
  it("accepts an audited adjustment", () => expect(() => validateWalletEntry(valid)).not.toThrow());
  it("requires an adjustment reason", () => expect(() => validateWalletEntry({ ...valid, reason: "" })).toThrow("require a reason"));
  it("blocks positive order debits", () => expect(() => validateWalletEntry({ ...valid, type: "order_debit", reason: undefined })).toThrow("must be negative"));
  it("blocks unsupported currencies and unsafe amounts", () => { expect(() => validateWalletEntry({ ...valid, currency: "BTC" })).toThrow(); expect(() => validateWalletEntry({ ...valid, deltaMinor: Number.MAX_SAFE_INTEGER + 1 })).toThrow(); });
  it("blocks malformed idempotency keys", () => expect(() => validateWalletEntry({ ...valid, idempotencyKey: "bad/key" })).toThrow());
});
