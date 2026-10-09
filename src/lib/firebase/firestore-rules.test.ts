import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rules = readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8");

describe("Firestore rules regression guard", () => {
  it("keeps financial and operational writes server-only", () => {
    for (const collection of ["wallets", "walletTransactions", "walletLedger", "paymentIntents", "orders", "services", "notificationSummaries"]) {
      const line = rules.split(/\r?\n/).find((entry) => entry.includes(`match /${collection}/`));
      expect(line, `${collection} rule`).toContain("allow write: if false");
    }
  });

  it("does not expose private service records publicly", () => {
    const line = rules.split(/\r?\n/).find((entry) => entry.includes("match /services/"));
    expect(line).toContain("allow read: if admin()");
  });
});
