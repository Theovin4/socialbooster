import { describe, expect, it } from "vitest";
import { generateCustomerApiKey, hashCustomerApiKey } from "./customer-api";

describe("customer API keys", () => {
  it("generates strong non-repeating live keys", () => {
    const first = generateCustomerApiKey(), second = generateCustomerApiKey();
    expect(first).toMatch(/^sb_live_[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it("stores a deterministic hash instead of the secret", () => {
    const key = "sb_live_abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
    const hash = hashCustomerApiKey(key);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(key);
  });
});
