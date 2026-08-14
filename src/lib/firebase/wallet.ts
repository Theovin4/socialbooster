import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./admin";

export type LedgerType = "deposit" | "order_debit" | "refund" | "admin_adjustment" | "promotional_credit";
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

export async function ensureWallet(userId: string, currency = "USD") {
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
  return db.runTransaction(async (transaction) => {
    const [existing, wallet] = await Promise.all([transaction.get(transactionRef), transaction.get(walletRef)]);
    if (existing.exists) return { transactionId: transactionRef.id, duplicate: true };
    const current = wallet.exists ? Number(wallet.get("availableMinor") ?? wallet.get("balanceMinor") ?? 0) : 0;
    const reserved = wallet.exists ? Number(wallet.get("reservedMinor") ?? 0) : 0;
    const currency = wallet.exists ? String(wallet.get("currency") || input.currency) : input.currency;
    if (currency !== input.currency) throw new Error("Wallet currency mismatch");
    const next = current + input.deltaMinor;
    if (!Number.isSafeInteger(next) || next < 0) throw new Error("Insufficient funds");
    transaction.set(walletRef, { userId: input.userId, currency, availableMinor: next, reservedMinor: reserved, balanceMinor: next, version: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(), ...(wallet.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
    transaction.create(transactionRef, { ...input, balanceBeforeMinor: current, balanceAfterMinor: next, status: "posted", createdAt: FieldValue.serverTimestamp() });
    transaction.create(ledgerRef, { walletUserId: input.userId, transactionId: transactionRef.id, type: input.type, deltaMinor: input.deltaMinor, currency, balanceBeforeMinor: current, balanceAfterMinor: next, reference: input.reference || null, reason: input.reason || null, actorUid: input.actorUid || null, createdAt: FieldValue.serverTimestamp() });
    if (input.type === "admin_adjustment") transaction.create(auditRef, { action: "wallet_admin_adjustment", targetType: "wallet", targetId: input.userId, transactionId: transactionRef.id, deltaMinor: input.deltaMinor, currency, reason: input.reason, actorUid: input.actorUid, createdAt: FieldValue.serverTimestamp() });
    return { transactionId: transactionRef.id, duplicate: false };
  });
}
