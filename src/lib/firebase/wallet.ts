import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./admin";
import { configuredUsdToNgnRateMicros, convertMinor } from "../currency";
import { sendAdminAlert } from "../email";

export type LedgerType = "deposit" | "order_debit" | "refund" | "admin_adjustment" | "promotional_credit" | "currency_conversion";
export type WalletEntry = { userId: string; type: LedgerType; deltaMinor: number; currency: string; idempotencyKey: string; reference?: string; reason?: string; actorUid?: string };

const CURRENCIES = new Set(["USD", "GBP", "EUR", "NGN", "CAD", "AUD"]);
const IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{8,160}$/;

export function validateWalletEntry(input: WalletEntry) {
  if (!input.userId || input.userId.length > 128) throw new Error("Invalid wallet user");
  if (!Number.isSafeInteger(input.deltaMinor) || input.deltaMinor === 0) throw new Error("Invalid wallet amount");
  if (!CURRENCIES.has(input.currency)) throw new Error("Unsupported wallet currency");
  if (!IDEMPOTENCY_KEY.test(input.idempotencyKey)) throw new Error("Invalid idempotency key");
  if (input.type === "order_debit" && input.deltaMinor > 0) throw new Error("Order debits must be negative");
  if (["deposit", "refund", "promotional_credit"].includes(input.type) && input.deltaMinor < 0) throw new Error("Wallet credit must be positive");
  if (input.type === "admin_adjustment" && (!input.reason || input.reason.trim().length < 5)) throw new Error("Admin adjustments require a reason");
}

export async function ensureWallet(userId: string, currency = "NGN") {
  if (!userId) throw new Error("Invalid wallet user");
  if (!CURRENCIES.has(currency)) throw new Error("Unsupported wallet currency");
  const db = adminDb(), ref = db.collection("wallets").doc(userId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) transaction.create(ref, { userId, currency, availableMinor: 0, reservedMinor: 0, balanceMinor: 0, version: 1, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  return ref;
}

export async function postWallet(input: WalletEntry) {
  validateWalletEntry(input);
  const db = adminDb(), walletRef = db.collection("wallets").doc(input.userId), transactionRef = db.collection("walletTransactions").doc(input.idempotencyKey), ledgerRef = db.collection("walletLedger").doc(input.idempotencyKey), auditRef = db.collection("auditLogs").doc(`wallet:${input.idempotencyKey}`);
  const result = await db.runTransaction(async (transaction) => {
    const [existing, wallet] = await Promise.all([transaction.get(transactionRef), transaction.get(walletRef)]);
    if (existing.exists) return { transactionId: transactionRef.id, duplicate: true };
    const current = wallet.exists ? Number(wallet.get("availableMinor") ?? wallet.get("balanceMinor") ?? 0) : 0;
    const reserved = wallet.exists ? Number(wallet.get("reservedMinor") ?? 0) : 0;
    const existingCurrency = wallet.exists ? String(wallet.get("currency") || input.currency) : input.currency;
    // Wallet pages are created eagerly in USD. An untouched, empty wallet may safely
    // adopt the currency of its first posted entry; funded wallets remain single-currency.
    const canAdoptCurrency = current === 0 && reserved === 0;
    const currency = existingCurrency === input.currency || canAdoptCurrency ? input.currency : existingCurrency;
    if (currency !== input.currency) throw new Error("Wallet currency mismatch");
    const next = current + input.deltaMinor;
    if (!Number.isSafeInteger(next) || next < 0) throw new Error("Insufficient funds");
    transaction.set(walletRef, { userId: input.userId, currency, availableMinor: next, reservedMinor: reserved, balanceMinor: next, version: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(), ...(wallet.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
    transaction.create(transactionRef, { ...input, balanceBeforeMinor: current, balanceAfterMinor: next, status: "posted", createdAt: FieldValue.serverTimestamp() });
    transaction.create(ledgerRef, { walletUserId: input.userId, transactionId: transactionRef.id, type: input.type, deltaMinor: input.deltaMinor, currency, balanceBeforeMinor: current, balanceAfterMinor: next, reference: input.reference || null, reason: input.reason || null, actorUid: input.actorUid || null, createdAt: FieldValue.serverTimestamp() });
    if (input.type === "admin_adjustment") transaction.create(auditRef, { action: "wallet_admin_adjustment", targetType: "wallet", targetId: input.userId, transactionId: transactionRef.id, deltaMinor: input.deltaMinor, currency, reason: input.reason, actorUid: input.actorUid, createdAt: FieldValue.serverTimestamp() });
    return { transactionId: transactionRef.id, duplicate: false };
  });
  if (!result.duplicate && input.deltaMinor > 0) await sendAdminAlert({ subject: `Wallet credit: ${input.currency} ${(input.deltaMinor / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`, title: "Customer wallet credited", message: `A ${input.type.replaceAll("_", " ")} of ${input.currency} ${(input.deltaMinor / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })} was posted for customer ${input.userId}. Reference: ${input.reference || result.transactionId}.`, buttonLabel: "View transactions", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/admin/transactions` }).catch((error) => console.warn("[admin-credit-email] delivery failed", { transactionId: result.transactionId, error: error instanceof Error ? error.message : "Unknown error" }));
  return result;
}

export async function migrateLegacyUsdWalletToNgn(userId: string) {
  const db = adminDb(), walletRef = db.collection("wallets").doc(userId), idempotencyKey = `migration:usd-ngn:${userId}`, transactionRef = db.collection("walletTransactions").doc(idempotencyKey), ledgerRef = db.collection("walletLedger").doc(idempotencyKey), auditRef = db.collection("auditLogs").doc(`wallet:${idempotencyKey}`);
  return db.runTransaction(async (transaction) => {
    const [existing, wallet] = await Promise.all([transaction.get(transactionRef), transaction.get(walletRef)]);
    if (existing.exists || (wallet.exists && wallet.get("currency") === "NGN")) return { duplicate: true };
    if (!wallet.exists || wallet.get("currency") !== "USD") throw new Error("Legacy USD wallet not found");
    const sourceAmountMinor = Number(wallet.get("availableMinor") ?? wallet.get("balanceMinor") ?? 0), reservedMinor = Number(wallet.get("reservedMinor") ?? 0);
    if (!Number.isSafeInteger(sourceAmountMinor) || sourceAmountMinor < 0 || reservedMinor !== 0) throw new Error("Legacy wallet cannot be converted automatically");
    const rateMicros = configuredUsdToNgnRateMicros(), convertedAmountMinor = Number(convertMinor(BigInt(sourceAmountMinor), rateMicros));
    const record = { userId, type: "currency_conversion", deltaMinor: convertedAmountMinor, currency: "NGN", sourceCurrency: "USD", sourceAmountMinor, exchangeRateMicros: Number(rateMicros), balanceBeforeMinor: 0, balanceAfterMinor: convertedAmountMinor, status: "posted", idempotencyKey, reason: "Legacy USD wallet converted to the NGN default", createdAt: FieldValue.serverTimestamp() };
    transaction.set(walletRef, { currency: "NGN", availableMinor: convertedAmountMinor, reservedMinor: 0, balanceMinor: convertedAmountMinor, version: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.create(transactionRef, record);
    transaction.create(ledgerRef, { ...record, walletUserId: userId, transactionId: idempotencyKey });
    transaction.create(auditRef, { action: "wallet_currency_conversion", targetType: "wallet", targetId: userId, sourceCurrency: "USD", sourceAmountMinor, currency: "NGN", convertedAmountMinor, exchangeRateMicros: Number(rateMicros), createdAt: FieldValue.serverTimestamp() });
    return { duplicate: false, sourceAmountMinor, convertedAmountMinor };
  });
}
