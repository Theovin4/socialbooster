import { describe, expect, it } from "vitest";
import { classifyFlutterwaveDiagnostic } from "./diagnostics";

const evidence = {
  providerTransactionId: "123",
  intent: { userId: "user-1", provider: "flutterwave", providerTransactionId: "123", reference: "flw_reference_12345678", amountMinor: 20_000, currency: "NGN", status: "paid" },
  transaction: { userId: "user-1", type: "deposit", status: "posted", deltaMinor: 20_000, currency: "NGN", reference: "flw_reference_12345678" },
  ledger: { walletUserId: "user-1", transactionId: "flutterwave:123", type: "deposit", deltaMinor: 20_000, currency: "NGN", reference: "flw_reference_12345678" },
  wallet: { availableMinor: 10_000, currency: "NGN" },
  subsequentActivity: [] as Array<Record<string, unknown>>,
};

describe("Flutterwave payment diagnostic classification", () => {
  it("distinguishes a posted payment from a later spend", () => {
    expect(classifyFlutterwaveDiagnostic(evidence)).toBe("PAYMENT CREDITED; NO LATER SPENDING OBSERVED");
    expect(classifyFlutterwaveDiagnostic({ ...evidence, subsequentActivity: [{ type: "order_debit", deltaMinor: -10_000 }] })).toBe("PAYMENT CREDITED AND LATER SPENT");
  });

  it("does not mistake a paid intent without wallet evidence for a credit", () => {
    expect(classifyFlutterwaveDiagnostic({ ...evidence, transaction: null, ledger: null })).toBe("FIRESTORE EVIDENCE INCOMPLETE");
  });

  it("reports not credited when no wallet effect exists on a pending intent", () => {
    expect(classifyFlutterwaveDiagnostic({ ...evidence, intent: { ...evidence.intent, status: "pending" }, transaction: null, ledger: null })).toBe("PAYMENT NOT CREDITED");
  });

  it("requires matching transaction and ledger evidence", () => {
    expect(classifyFlutterwaveDiagnostic({ ...evidence, ledger: { ...evidence.ledger, deltaMinor: 19_000 } })).toBe("FIRESTORE EVIDENCE INCOMPLETE");
  });

  it("uses the canonical provider transaction ID when a historical wallet row lacks that field", () => {
    expect(classifyFlutterwaveDiagnostic({
      ...evidence,
      transaction: { ...evidence.transaction, providerTransactionId: null },
      intent: { ...evidence.intent, providerTransactionId: null },
    })).toBe("PAYMENT CREDITED; NO LATER SPENDING OBSERVED");
  });
});
