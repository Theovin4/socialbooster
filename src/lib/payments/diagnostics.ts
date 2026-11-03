type DiagnosticRecord = Record<string, unknown> | null;

export type FlutterwaveDiagnosticEvidence = {
  providerTransactionId?: string | null;
  intent: DiagnosticRecord;
  transaction: DiagnosticRecord;
  ledger: DiagnosticRecord;
  wallet: DiagnosticRecord;
  subsequentActivity: Array<Record<string, unknown>>;
};

export type FlutterwaveDiagnosticClassification =
  | "PAYMENT NOT CREDITED"
  | "PAYMENT CREDITED AND LATER SPENT"
  | "PAYMENT CREDITED; NO LATER SPENDING OBSERVED"
  | "FIRESTORE EVIDENCE INCOMPLETE";

export function classifyFlutterwaveDiagnostic(evidence: FlutterwaveDiagnosticEvidence): FlutterwaveDiagnosticClassification {
  const { intent, transaction, ledger } = evidence;
  if (!transaction && !ledger) {
    return intent?.status === "paid" ? "FIRESTORE EVIDENCE INCOMPLETE" : "PAYMENT NOT CREDITED";
  }
  if (!transaction || !ledger || !intent) return "FIRESTORE EVIDENCE INCOMPLETE";

  const userId = String(intent.userId || "");
  const providerTransactionId = evidence.providerTransactionId || String(intent.providerTransactionId || "");
  const expectedAmount = Number(intent.amountMinor);
  const currency = String(intent.currency || "");
  const reference = String(intent.reference || "");
  const matches = Boolean(userId && reference && providerTransactionId)
    && intent.provider === "flutterwave"
    && transaction.userId === userId
    && transaction.type === "deposit"
    && transaction.status === "posted"
    && Number(transaction.deltaMinor) === expectedAmount
    && transaction.currency === currency
    && transaction.reference === reference
    && ledger.walletUserId === userId
    && ledger.transactionId === `flutterwave:${providerTransactionId}`
    && ledger.type === "deposit"
    && Number(ledger.deltaMinor) === expectedAmount
    && ledger.currency === currency
    && ledger.reference === reference;
  if (!matches) return "FIRESTORE EVIDENCE INCOMPLETE";

  if (evidence.subsequentActivity.some((activity) =>
    Number(activity.deltaMinor) < 0 || ["debit", "spend", "order"].includes(String(activity.type || "").toLowerCase()))) {
    return "PAYMENT CREDITED AND LATER SPENT";
  }
  return "PAYMENT CREDITED; NO LATER SPENDING OBSERVED";
}
