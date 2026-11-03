import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Stored = Record<string, unknown>;
type Ref = { path: string; get: () => Promise<ReturnType<typeof snapshot>> };

const memory = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  queue: Promise.resolve() as Promise<unknown>,
  failBeforeCommit: false,
}));
const sideEffects = vi.hoisted(() => ({
  marketing: vi.fn().mockResolvedValue(undefined),
  userEmail: vi.fn().mockResolvedValue(undefined),
  adminAlert: vi.fn().mockResolvedValue(undefined),
}));
const providerMocks = vi.hoisted(() => ({
  verify: vi.fn(),
  verifyByReference: vi.fn(),
}));

function snapshot(path: string) {
  const value = memory.docs.get(path);
  return { exists: Boolean(value), data: () => value, get: (field: string) => value?.[field] };
}

function ref(path: string): Ref {
  return { path, get: async () => snapshot(path) };
}

const fakeDb = {
  collection(name: string) {
    return { doc: (id: string) => ref(`${name}/${id}`) };
  },
  runTransaction<T>(callback: (transaction: {
    get: (document: Ref) => Promise<ReturnType<typeof snapshot>>;
    set: (document: Ref, data: Stored, options?: { merge?: boolean }) => void;
    create: (document: Ref, data: Stored) => void;
  }) => Promise<T>) {
    const execute = memory.queue.then(async () => {
      const writes: Array<{ kind: "set" | "create"; document: Ref; data: Stored; merge?: boolean }> = [];
      const result = await callback({
        get: async (document) => snapshot(document.path),
        set: (document, data, options) => writes.push({ kind: "set", document, data, merge: options?.merge }),
        create: (document, data) => writes.push({ kind: "create", document, data }),
      });
      if (memory.failBeforeCommit) { memory.failBeforeCommit = false; throw new Error("synthetic_commit_failure"); }
      for (const write of writes) {
        if (write.kind === "create" && memory.docs.has(write.document.path)) throw new Error("already_exists");
        const current = write.merge ? memory.docs.get(write.document.path) || {} : {};
        memory.docs.set(write.document.path, { ...current, ...write.data });
      }
      return result;
    });
    memory.queue = execute.catch(() => undefined);
    return execute;
  },
};

vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => fakeDb }));
vi.mock("@/lib/firebase/wallet", () => ({ migrateLegacyUsdWalletToNgn: vi.fn() }));
vi.mock("@/lib/firebase/analytics-rollups", () => ({ recordWalletRollup: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendAdminAlert: sideEffects.adminAlert, sendUserEmail: sideEffects.userEmail }));
vi.mock("@/lib/marketing-profile", () => ({ recordFundingMarketing: sideEffects.marketing }));
vi.mock("./flutterwave", () => ({ verifyFlutterwaveTransaction: providerMocks.verify, verifyFlutterwaveTransactionByReference: providerMocks.verifyByReference }));

import { assertExistingPaymentEffectMatches, assertPaymentIntentMatches, creditVerifiedPayment, reconcilePendingFlutterwavePayment, validateVerifiedPaymentInput, type VerifiedPaymentInput } from "./credit";

const input: VerifiedPaymentInput = { provider: "flutterwave", reference: "flw_reference_12345678", providerTransactionId: "2111150666", amountMinor: 20_000, currency: "NGN", source: "test" };

function seed(reference = input.reference, userId = "user-1", amountMinor = input.amountMinor) {
  memory.docs.set(`paymentIntents/${reference}`, { userId, provider: "flutterwave", amountMinor, currency: "NGN", status: "pending" });
  memory.docs.set(`wallets/${userId}`, { userId, currency: "NGN", availableMinor: 5_000, reservedMinor: 0, balanceMinor: 5_000 });
}

describe("atomic verified payment credit", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    memory.docs.clear();
    memory.queue = Promise.resolve();
    memory.failBeforeCommit = false;
    sideEffects.marketing.mockReset().mockResolvedValue(undefined);
    sideEffects.userEmail.mockReset().mockResolvedValue(undefined);
    sideEffects.adminAlert.mockReset().mockResolvedValue(undefined);
    providerMocks.verify.mockReset();
    providerMocks.verifyByReference.mockReset();
  });

  it("writes the wallet, transaction, ledger, intent and event exactly once", async () => {
    seed();
    const result = await creditVerifiedPayment(input);
    expect(result.duplicate).toBe(false);
    expect(memory.docs.get("wallets/user-1")?.availableMinor).toBe(25_000);
    expect(memory.docs.get("walletTransactions/flutterwave:2111150666")).toMatchObject({ userId: "user-1", deltaMinor: 20_000, reference: input.reference, status: "posted" });
    expect(memory.docs.get("walletTransactions/flutterwave:2111150666")?.providerTransactionId).toBe(input.providerTransactionId);
    expect(memory.docs.get("walletLedger/flutterwave:2111150666")).toMatchObject({ walletUserId: "user-1", deltaMinor: 20_000, reference: input.reference, providerTransactionId: input.providerTransactionId });
    expect(memory.docs.get(`paymentIntents/${input.reference}`)).toMatchObject({ status: "paid", providerTransactionId: "2111150666" });
    expect(memory.docs.get("paymentEvents/flutterwave:2111150666")).toMatchObject({ status: "processed", reference: input.reference });
  });

  it("does not credit a duplicate callback twice", async () => {
    seed();
    await creditVerifiedPayment(input);
    const duplicate = await creditVerifiedPayment({ ...input, source: "direct_webhook" });
    expect(duplicate.duplicate).toBe(true);
    expect(memory.docs.get("wallets/user-1")?.availableMinor).toBe(25_000);
  });

  it("serializes simultaneous callback and webhook attempts", async () => {
    seed();
    const results = await Promise.all([creditVerifiedPayment({ ...input, source: "browser_callback" }), creditVerifiedPayment({ ...input, source: "direct_webhook" })]);
    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    expect(memory.docs.get("wallets/user-1")?.availableMinor).toBe(25_000);
  });

  it("serializes reconciliation and webhook attempts", async () => {
    seed();
    const results = await Promise.all([
      creditVerifiedPayment({ ...input, source: "admin_reconciliation" }),
      creditVerifiedPayment({ ...input, source: "direct_webhook" }),
    ]);
    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    expect(memory.docs.get("wallets/user-1")?.availableMinor).toBe(25_000);
  });

  it("treats a paid intent with canonical wallet and ledger evidence as finalized even when its event is missing", async () => {
    seed();
    memory.docs.set(`paymentIntents/${input.reference}`, { userId: "user-1", provider: "flutterwave", amountMinor: input.amountMinor, currency: "NGN", status: "paid", providerTransactionId: input.providerTransactionId });
    memory.docs.set("walletTransactions/flutterwave:2111150666", { userId: "user-1", type: "deposit", deltaMinor: input.amountMinor, currency: "NGN", reference: input.reference, status: "posted", providerTransactionId: input.providerTransactionId, balanceBeforeMinor: 5_000, balanceAfterMinor: 25_000 });
    memory.docs.set("walletLedger/flutterwave:2111150666", { walletUserId: "user-1", transactionId: "flutterwave:2111150666", type: "deposit", deltaMinor: input.amountMinor, currency: "NGN", reference: input.reference, providerTransactionId: input.providerTransactionId, balanceBeforeMinor: 5_000, balanceAfterMinor: 25_000 });
    const result = await creditVerifiedPayment(input);
    expect(result.duplicate).toBe(true);
    expect(memory.docs.get("wallets/user-1")?.availableMinor).toBe(5_000);
    expect(memory.docs.get("paymentEvents/flutterwave:2111150666")?.status).toBe("processed");
  });

  it("does not re-credit canonical historical evidence when the paymentEvent is absent", async () => {
    seed();
    await creditVerifiedPayment(input);
    memory.docs.delete("paymentEvents/flutterwave:2111150666");
    const result = await creditVerifiedPayment({ ...input, source: "customer_return_recovery" });
    expect(result.duplicate).toBe(true);
    expect(memory.docs.get("wallets/user-1")?.availableMinor).toBe(25_000);
  });

  it("keeps a pending provider verification uncredited during customer recovery", async () => {
    seed();
    providerMocks.verifyByReference.mockResolvedValue({ id: 2111150666, status: "pending", amount: 200, currency: "NGN", tx_ref: input.reference });
    await expect(reconcilePendingFlutterwavePayment("user-1", input.reference)).resolves.toEqual({ credited: false, status: "pending" });
    expect(memory.docs.get("wallets/user-1")?.availableMinor).toBe(5_000);
    expect(memory.docs.has("walletTransactions/flutterwave:2111150666")).toBe(false);
  });

  it("routes successful customer recovery through the atomic payment finalizer", async () => {
    seed();
    providerMocks.verifyByReference.mockResolvedValue({ id: 2111150666, status: "successful", amount: 200, currency: "NGN", tx_ref: input.reference });
    await expect(reconcilePendingFlutterwavePayment("user-1", input.reference)).resolves.toEqual({ credited: true, status: "paid" });
    expect(memory.docs.get("wallets/user-1")?.availableMinor).toBe(25_000);
    expect(memory.docs.get("paymentEvents/flutterwave:2111150666")?.status).toBe("processed");
  });

  it("prevents one provider transaction from crediting two intents or wallets", async () => {
    seed();
    seed("flw_other_reference_123456", "user-2", 20_000);
    const results = await Promise.allSettled([creditVerifiedPayment(input), creditVerifiedPayment({ ...input, reference: "flw_other_reference_123456" })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(Number(memory.docs.get("wallets/user-1")?.availableMinor) + Number(memory.docs.get("wallets/user-2")?.availableMinor)).toBe(30_000);
  });

  it("persists gateway delivery and event receipts with the financial effect", async () => {
    seed();
    const result = await creditVerifiedPayment({ ...input, gatewayDeliveryId: "delivery-1", gatewayEventId: "event-1" });
    expect(result.duplicate).toBe(false);
    expect(memory.docs.get("gatewayDeliveryReceipts/delivery-1")).toMatchObject({ status: "applied", reference: input.reference });
    expect(memory.docs.get("gatewayEventReceipts/event-1")).toMatchObject({ status: "applied", reference: input.reference });
  });

  it("acknowledges a gateway retry without another credit", async () => {
    seed();
    await creditVerifiedPayment({ ...input, gatewayDeliveryId: "delivery-1", gatewayEventId: "event-1" });
    const result = await creditVerifiedPayment({ ...input, gatewayDeliveryId: "delivery-2", gatewayEventId: "event-2" });
    expect(result.duplicate).toBe(true);
    expect(memory.docs.get("wallets/user-1")?.availableMinor).toBe(25_000);
    expect(memory.docs.get("gatewayDeliveryReceipts/delivery-2")?.status).toBe("duplicate");
  });

  it("does not leave a partial credit when the Firestore transaction fails", async () => {
    seed(); memory.failBeforeCommit = true;
    await expect(creditVerifiedPayment(input)).rejects.toThrow("synthetic_commit_failure");
    expect(memory.docs.get("wallets/user-1")?.availableMinor).toBe(5_000);
    expect(memory.docs.has("walletTransactions/flutterwave:2111150666")).toBe(false);
    const retry = await creditVerifiedPayment(input);
    expect(retry.duplicate).toBe(false);
    expect(memory.docs.get("wallets/user-1")?.availableMinor).toBe(25_000);
  });

  it("preserves existing wallet history while appending the verified deposit", async () => {
    seed();
    memory.docs.set("walletTransactions/older-entry", { userId: "user-1", type: "refund", deltaMinor: 500, currency: "NGN", status: "posted" });
    await creditVerifiedPayment(input);
    expect(memory.docs.get("walletTransactions/older-entry")).toMatchObject({ type: "refund", deltaMinor: 500 });
    expect(memory.docs.has("walletTransactions/flutterwave:2111150666")).toBe(true);
  });

  it("fails closed when the payment intent is missing", async () => {
    await expect(creditVerifiedPayment(input)).rejects.toThrow("Unknown payment reference");
    expect(memory.docs.has("walletTransactions/flutterwave:2111150666")).toBe(false);
  });

  it("does not fail wallet credit when email or marketing side effects fail", async () => {
    seed();
    vi.stubEnv("RESEND_API_KEY", "synthetic");
    vi.stubEnv("EMAIL_FROM", "test@example.invalid");
    sideEffects.marketing.mockRejectedValueOnce(new Error("synthetic_marketing_failure"));
    sideEffects.userEmail.mockRejectedValueOnce(new Error("synthetic_email_failure"));
    sideEffects.adminAlert.mockRejectedValueOnce(new Error("synthetic_alert_failure"));
    await expect(creditVerifiedPayment(input)).resolves.toMatchObject({ duplicate: false });
    expect(memory.docs.get("wallets/user-1")?.availableMinor).toBe(25_000);
  });
});

describe("payment ownership and invariant validation", () => {
  beforeEach(() => {
    memory.docs.clear();
    memory.queue = Promise.resolve();
    memory.failBeforeCommit = false;
  });

  it("rejects an incorrect amount, currency or provider", () => {
    const intent = { userId: "user-1", provider: "flutterwave", amountMinor: 20_000, currency: "NGN" };
    expect(() => assertPaymentIntentMatches(intent, { ...input, amountMinor: 19_999 })).toThrow("do not match");
    expect(() => assertPaymentIntentMatches(intent, { ...input, currency: "USD" })).toThrow("do not match");
    expect(() => assertPaymentIntentMatches(intent, { ...input, provider: "paypal" })).toThrow("do not match");
  });

  it("rejects an intent already bound to another provider transaction", () => {
    expect(() => assertPaymentIntentMatches({ userId: "user-1", provider: "flutterwave", amountMinor: 20_000, currency: "NGN", providerTransactionId: "different" }, input)).toThrow("already bound");
  });

  it("rejects a replay whose stored owner or reference differs", () => {
    const stored = { userId: "user-2", type: "deposit", deltaMinor: 20_000, currency: "NGN", reference: input.reference, status: "posted" };
    expect(() => assertExistingPaymentEffectMatches(stored, input, "user-1", "transaction")).toThrow("different payment effect");
    expect(() => assertExistingPaymentEffectMatches({ ...stored, userId: "user-1", reference: "flw_other" }, input, "user-1", "transaction")).toThrow("different payment effect");
  });

  it("rejects malformed, unsafe and incomplete payment identities", () => {
    expect(() => validateVerifiedPaymentInput({ ...input, providerTransactionId: "bad/id" })).toThrow("provider transaction");
    expect(() => validateVerifiedPaymentInput({ ...input, amountMinor: 0 })).toThrow("amount");
    expect(() => validateVerifiedPaymentInput({ ...input, gatewayDeliveryId: "delivery-1" })).toThrow("Incomplete gateway");
  });

  it("rejects an amount or currency mismatch before writing wallet effects", async () => {
    seed();
    await expect(creditVerifiedPayment({ ...input, amountMinor: 19_999 })).rejects.toThrow("do not match");
    await expect(creditVerifiedPayment({ ...input, currency: "USD" })).rejects.toThrow("do not match");
    expect(memory.docs.get("wallets/user-1")?.availableMinor).toBe(5_000);
    expect(memory.docs.has("walletTransactions/flutterwave:2111150666")).toBe(false);
  });

  it("rejects a conflicting existing payment event", async () => {
    seed();
    memory.docs.set("paymentEvents/flutterwave:2111150666", { provider: "flutterwave", reference: "flw_other_reference", providerTransactionId: input.providerTransactionId, status: "failed" });
    await expect(creditVerifiedPayment(input)).rejects.toThrow("Payment event conflicts");
    expect(memory.docs.get("wallets/user-1")?.availableMinor).toBe(5_000);
  });
});
