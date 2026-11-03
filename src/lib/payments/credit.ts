import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { migrateLegacyUsdWalletToNgn } from "@/lib/firebase/wallet";
import { recordWalletRollup } from "@/lib/firebase/analytics-rollups";
import { decimalToMinor } from "@/lib/money";
import { verifyFlutterwaveTransaction, verifyFlutterwaveTransactionByReference } from "./flutterwave";
import { sendAdminAlert, sendUserEmail } from "@/lib/email";
import { recordFundingMarketing } from "@/lib/marketing-profile";

export type VerifiedPaymentInput = {
  provider: "flutterwave" | "paypal";
  reference: string;
  providerTransactionId: string;
  amountMinor: number;
  currency: string;
  source?: string;
  gatewayDeliveryId?: string;
  gatewayEventId?: string;
};

const SAFE_ID = /^[A-Za-z0-9._:@-]{1,200}$/;

export function validateVerifiedPaymentInput(input: VerifiedPaymentInput) {
  if (!SAFE_ID.test(input.reference)) throw new Error("Invalid payment reference");
  if (!SAFE_ID.test(input.providerTransactionId)) throw new Error("Invalid provider transaction ID");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("Invalid payment amount");
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("Invalid payment currency");
  if (input.gatewayDeliveryId && !SAFE_ID.test(input.gatewayDeliveryId)) throw new Error("Invalid gateway delivery ID");
  if (input.gatewayEventId && !SAFE_ID.test(input.gatewayEventId)) throw new Error("Invalid gateway event ID");
  if (Boolean(input.gatewayDeliveryId) !== Boolean(input.gatewayEventId)) throw new Error("Incomplete gateway receipt identity");
}

export function assertPaymentIntentMatches(expected: Record<string, unknown>, input: VerifiedPaymentInput) {
  const userId = String(expected.userId || "");
  if (!userId || userId.length > 128) throw new Error("Payment intent owner is invalid");
  if (expected.provider !== input.provider || Number(expected.amountMinor) !== input.amountMinor || expected.currency !== input.currency) throw new Error("Payment details do not match");
  const boundTransactionId = expected.providerTransactionId ? String(expected.providerTransactionId) : null;
  if (boundTransactionId && boundTransactionId !== input.providerTransactionId) throw new Error("Payment intent is already bound to another provider transaction");
  return userId;
}

export function assertExistingPaymentEffectMatches(data: Record<string, unknown>, input: VerifiedPaymentInput, userId: string, kind: "transaction" | "ledger") {
  const owner = kind === "ledger" ? data.walletUserId : data.userId;
  const transactionId = `${input.provider}:${input.providerTransactionId}`;
  if (String(owner || "") !== userId
    || data.type !== "deposit"
    || Number(data.deltaMinor) !== input.amountMinor
    || data.currency !== input.currency
    || data.reference !== input.reference
    || (kind === "transaction" && data.status !== "posted")
    || (kind === "ledger" && data.transactionId !== transactionId)) {
    throw new Error("Provider transaction is already bound to a different payment effect");
  }
}

function assertGatewayReceiptMatches(data: Record<string, unknown>, input: VerifiedPaymentInput) {
  if (data.applicationId !== "social_booster"
    || data.eventId !== input.gatewayEventId
    || data.providerTransactionKey !== `${input.provider}:${input.providerTransactionId}`
    || data.reference !== input.reference) {
    throw new Error("Gateway receipt conflicts with an existing delivery");
  }
}

export async function creditVerifiedPayment(input: VerifiedPaymentInput) {
  validateVerifiedPaymentInput(input);
  const db = adminDb();
  const intentRef = db.collection("paymentIntents").doc(input.reference);

  // Preserve the existing audited legacy-wallet conversion. The payment effect
  // itself is still finalized atomically below and re-reads every invariant.
  if (input.currency === "NGN") {
    const intent = await intentRef.get();
    if (!intent.exists) throw new Error("Unknown payment reference");
    const userId = assertPaymentIntentMatches(intent.data()!, input);
    const wallet = await db.collection("wallets").doc(userId).get();
    if (wallet.exists && wallet.get("currency") === "USD" && Number(wallet.get("availableMinor") ?? wallet.get("balanceMinor") ?? 0) > 0) await migrateLegacyUsdWalletToNgn(userId);
  }

  const transactionId = `${input.provider}:${input.providerTransactionId}`;
  const transactionRef = db.collection("walletTransactions").doc(transactionId);
  const ledgerRef = db.collection("walletLedger").doc(transactionId);
  const eventRef = db.collection("paymentEvents").doc(transactionId);
  const deliveryRef = input.gatewayDeliveryId ? db.collection("gatewayDeliveryReceipts").doc(input.gatewayDeliveryId) : null;
  const gatewayEventRef = input.gatewayEventId ? db.collection("gatewayEventReceipts").doc(input.gatewayEventId) : null;

  const result = await db.runTransaction(async (transaction) => {
    const intent = await transaction.get(intentRef);
    if (!intent.exists) throw new Error("Unknown payment reference");
    const expected = intent.data()!;
    const userId = assertPaymentIntentMatches(expected, input);
    const walletRef = db.collection("wallets").doc(userId);
    const reads = await Promise.all([
      transaction.get(walletRef),
      transaction.get(transactionRef),
      transaction.get(ledgerRef),
      transaction.get(eventRef),
      ...(deliveryRef ? [transaction.get(deliveryRef)] : []),
      ...(gatewayEventRef ? [transaction.get(gatewayEventRef)] : []),
    ]);
    const [wallet, existingTransaction, existingLedger, existingEvent] = reads;
    const delivery = deliveryRef ? reads[4] : null;
    const gatewayEvent = gatewayEventRef ? reads[deliveryRef ? 5 : 4] : null;

    if (delivery?.exists) assertGatewayReceiptMatches(delivery.data()!, input);
    if (gatewayEvent?.exists) assertGatewayReceiptMatches(gatewayEvent.data()!, input);
    if (existingEvent.exists) {
      const event = existingEvent.data()!;
      if (event.provider !== input.provider
        || event.reference !== input.reference
        || String(event.providerTransactionId || "") !== input.providerTransactionId) {
        throw new Error("Payment event conflicts with the verified transaction");
      }
    }

    if (existingTransaction.exists) {
      assertExistingPaymentEffectMatches(existingTransaction.data()!, input, userId, "transaction");
      if (!existingLedger.exists) throw new Error("Payment ledger is incomplete");
      assertExistingPaymentEffectMatches(existingLedger.data()!, input, userId, "ledger");
      transaction.set(intentRef, { status: "paid", providerTransactionId: input.providerTransactionId, verifiedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(eventRef, { provider: input.provider, reference: input.reference, providerTransactionId: input.providerTransactionId, status: "processed", sources: FieldValue.arrayUnion(input.source || "verified"), processedAt: FieldValue.serverTimestamp() }, { merge: true });
      const receipt = { applicationId: "social_booster", eventId: input.gatewayEventId, providerTransactionKey: transactionId, reference: input.reference, status: "duplicate", receivedAt: FieldValue.serverTimestamp() };
      if (deliveryRef && !delivery?.exists) transaction.create(deliveryRef, receipt);
      if (gatewayEventRef && !gatewayEvent?.exists) transaction.create(gatewayEventRef, receipt);
      return { duplicate: true, userId, expected };
    }

    if (existingLedger.exists) throw new Error("Payment ledger exists without its wallet transaction");
    if (existingEvent.exists && ["processed", "admin_reconciled"].includes(String(existingEvent.get("status") || ""))) throw new Error("Payment event exists without its wallet transaction");
    if (delivery?.exists || gatewayEvent?.exists) throw new Error("Gateway receipt exists without its wallet transaction");
    if (expected.status === "paid") throw new Error("Paid intent is missing its wallet transaction");

    const current = wallet.exists ? Number(wallet.get("availableMinor") ?? wallet.get("balanceMinor") ?? 0) : 0;
    const reserved = wallet.exists ? Number(wallet.get("reservedMinor") ?? 0) : 0;
    const existingCurrency = wallet.exists ? String(wallet.get("currency") || input.currency) : input.currency;
    const canAdoptCurrency = current === 0 && reserved === 0;
    const currency = existingCurrency === input.currency || canAdoptCurrency ? input.currency : existingCurrency;
    if (currency !== input.currency) throw new Error("Wallet currency mismatch");
    const next = current + input.amountMinor;
    if (!Number.isSafeInteger(current) || !Number.isSafeInteger(reserved) || reserved < 0 || !Number.isSafeInteger(next) || next < 0) throw new Error("Wallet balance is invalid");

    transaction.set(walletRef, { userId, currency, availableMinor: next, reservedMinor: reserved, balanceMinor: next, version: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(), ...(wallet.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
    transaction.create(transactionRef, { userId, type: "deposit", deltaMinor: input.amountMinor, currency, idempotencyKey: transactionId, providerTransactionId: input.providerTransactionId, reference: input.reference, balanceBeforeMinor: current, balanceAfterMinor: next, status: "posted", createdAt: FieldValue.serverTimestamp() });
    transaction.create(ledgerRef, { walletUserId: userId, transactionId, type: "deposit", deltaMinor: input.amountMinor, currency, providerTransactionId: input.providerTransactionId, reference: input.reference, balanceBeforeMinor: current, balanceAfterMinor: next, createdAt: FieldValue.serverTimestamp() });
    transaction.set(intentRef, { status: "paid", providerTransactionId: input.providerTransactionId, verifiedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(eventRef, { provider: input.provider, reference: input.reference, providerTransactionId: input.providerTransactionId, status: "processed", sources: FieldValue.arrayUnion(input.source || "verified"), processedAt: FieldValue.serverTimestamp() }, { merge: true });
    const receipt = { applicationId: "social_booster", eventId: input.gatewayEventId, providerTransactionKey: transactionId, reference: input.reference, status: "applied", receivedAt: FieldValue.serverTimestamp() };
    if (deliveryRef) transaction.create(deliveryRef, receipt);
    if (gatewayEventRef) transaction.create(gatewayEventRef, receipt);
    recordWalletRollup(transaction, { type: "deposit", deltaMinor: input.amountMinor, currency });
    return { duplicate: false, userId, expected };
  });

  if (!result.duplicate) {
    await recordFundingMarketing(result.userId, input.provider === "flutterwave" ? "card" : "bank_transfer").catch((error) => console.warn("[payment-marketing-profile] update failed", { reference: input.reference, error: error instanceof Error ? error.message : "Unknown error" }));
    if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) await sendUserEmail(result.userId, { subject: "Your Social Booster wallet has been funded", title: "Payment confirmed", message: `Your verified ${input.currency} ${(input.amountMinor / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })} payment has been added to your wallet.`, buttonLabel: "View wallet", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/dashboard/wallet` }).catch((error) => console.warn("[payment-email] delivery failed", { reference: input.reference, error: error instanceof Error ? error.message : "Unknown error" }));
    await sendAdminAlert({ subject: `Wallet credit: ${input.currency} ${(input.amountMinor / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`, title: "Customer wallet credited", message: `A verified ${input.provider} deposit was posted. Reference: ${input.reference}.`, buttonLabel: "View transactions", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/admin/transactions` }).catch((error) => console.warn("[admin-credit-email] delivery failed", { transactionId, error: error instanceof Error ? error.message : "Unknown error" }));
  }
  return { ...result.expected, userId: result.userId, amountMinor: input.amountMinor, currency: input.currency, duplicate: result.duplicate };
}

async function creditFlutterwaveVerification(verified: { id: number; status: string; amount: number; currency: string; tx_ref: string }, source: string) {
  if (verified.status !== "successful") throw new Error("Flutterwave has not marked this transaction successful");
  const expected = await creditVerifiedPayment({ provider: "flutterwave", reference: verified.tx_ref, providerTransactionId: String(verified.id), amountMinor: Number(decimalToMinor(String(verified.amount))), currency: verified.currency, source });
  return { transactionId: verified.id, reference: verified.tx_ref, userId: String(expected.userId), amountMinor: Number(expected.amountMinor), currency: String(expected.currency), duplicate: expected.duplicate };
}

export async function reconcileFlutterwaveTransaction(transactionId: number, source = "manual") {
  return creditFlutterwaveVerification(await verifyFlutterwaveTransaction(transactionId), source);
}

export async function reconcilePendingFlutterwavePayment(userId: string, reference: string) {
  if (!SAFE_ID.test(reference)) return { credited: false, status: "invalid" as const };
  const intent = await adminDb().collection("paymentIntents").doc(reference).get();
  if (!intent.exists || intent.get("userId") !== userId || intent.get("provider") !== "flutterwave") return { credited: false, status: "unknown" as const };
  if (intent.get("status") === "paid") return { credited: true, status: "paid" as const };
  try {
    const verified = await verifyFlutterwaveTransactionByReference(reference);
    if (verified.status !== "successful") return { credited: false, status: "pending" as const };
    await creditFlutterwaveVerification(verified, "customer_return_recovery");
    return { credited: true, status: "paid" as const };
  } catch (error) {
    console.warn("[flutterwave:recovery] payment intent not reconciled", { reference, error: error instanceof Error ? error.message : "Unknown error" });
    return { credited: false, status: "pending" as const };
  }
}

/** Bounded compatibility path for callbacks created before return URLs included a reference. */
export async function reconcilePendingFlutterwavePayments(userId: string) {
  const snapshot = await adminDb().collection("paymentIntents").where("userId", "==", userId).where("provider", "==", "flutterwave").where("status", "==", "pending").limit(5).get();
  let credited = 0;
  for (const intent of snapshot.docs) {
    const result = await reconcilePendingFlutterwavePayment(userId, intent.id);
    if (result.credited) credited += 1;
  }
  return credited;
}
