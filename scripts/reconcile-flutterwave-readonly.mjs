import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const TARGETS = [
  { transactionId: "2111150666", reference: "flw_0386da91-7494-478e-8949-0f3383749fcc", amountMinor: 20000, currency: "NGN" },
  { transactionId: "2111151951", reference: "flw_e4bea4f4-e21d-4ef4-8998-78d50c544ece", amountMinor: 100000, currency: "NGN" },
  { transactionId: "2112136892", reference: "flw_83d0e15a-c158-4571-89b4-e4973be69ee3", amountMinor: 150000, currency: "NGN" },
];

function argument(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function ownerFingerprint(value) { return value ? createHash("sha256").update(String(value)).digest("hex").slice(0, 16) : null; }
function selected(snapshot, fields) {
  if (!snapshot.exists) return { exists: false };
  const data = snapshot.data();
  return { exists: true, ...Object.fromEntries(fields.map((field) => [field, data[field] ?? null])) };
}
function classify({ intent, transaction, ledger, duplicates, expected }) {
  if (!intent.exists) return "UNRESOLVED — INSUFFICIENT EVIDENCE";
  const owner = String(intent.get("userId") || "");
  const intentMatches = intent.get("provider") === "flutterwave" && Number(intent.get("amountMinor")) === expected.amountMinor && intent.get("currency") === expected.currency;
  if (!intentMatches || !owner) return "UNRESOLVED — INSUFFICIENT EVIDENCE";
  if (!transaction.exists && !ledger.exists) return "CREDIT MISSING — VERIFIED";
  if (!transaction.exists || !ledger.exists) return "UNRESOLVED — INSUFFICIENT EVIDENCE";
  const transactionMatches = transaction.get("userId") === owner && transaction.get("type") === "deposit" && Number(transaction.get("deltaMinor")) === expected.amountMinor && transaction.get("currency") === expected.currency && transaction.get("reference") === expected.reference && transaction.get("status") === "posted";
  const ledgerMatches = ledger.get("walletUserId") === owner && ledger.get("transactionId") === `flutterwave:${expected.transactionId}` && ledger.get("type") === "deposit" && Number(ledger.get("deltaMinor")) === expected.amountMinor && ledger.get("currency") === expected.currency && ledger.get("reference") === expected.reference;
  if (!transactionMatches || !ledgerMatches) return "UNRESOLVED — INSUFFICIENT EVIDENCE";
  return duplicates.length > 1 ? "DUPLICATE CREDIT — VERIFIED" : "CREDIT VERIFIED";
}

const serviceAccountPath = argument("--service-account"), expectedProjectId = argument("--project-id");
if (!serviceAccountPath || !expectedProjectId) throw new Error("Usage: npm run audit:flutterwave:readonly -- --service-account <viewer-key.json> --project-id <expected-project-id>");
const serviceAccount = JSON.parse(await readFile(serviceAccountPath, "utf8"));
if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) throw new Error("The selected file is not a Firebase service-account key");
if (serviceAccount.project_id !== expectedProjectId) throw new Error("Refusing to query an unexpected Firebase project");
const app = initializeApp({ credential: cert({ projectId: serviceAccount.project_id, clientEmail: serviceAccount.client_email, privateKey: serviceAccount.private_key }), projectId: serviceAccount.project_id });
const db = getFirestore(app), report = [];

for (const expected of TARGETS) {
  const key = `flutterwave:${expected.transactionId}`;
  const [intent, transaction, ledger, event, callback] = await db.getAll(
    db.collection("paymentIntents").doc(expected.reference), db.collection("walletTransactions").doc(key), db.collection("walletLedger").doc(key), db.collection("paymentEvents").doc(key), db.collection("paymentEvents").doc(`flutterwave-callback:${expected.transactionId}`),
  );
  const owner = intent.exists ? String(intent.get("userId") || "") : "";
  const [wallet, duplicateSnapshot, historySnapshot, eventVariants] = owner ? await Promise.all([
    db.collection("wallets").doc(owner).get(),
    db.collection("walletTransactions").where("reference", "==", expected.reference).limit(10).get(),
    db.collection("walletTransactions").where("userId", "==", owner).orderBy("createdAt", "desc").limit(25).get(),
    db.collection("paymentEvents").where("providerTransactionId", "==", expected.transactionId).limit(10).get(),
  ]) : [null, { docs: [] }, { docs: [] }, { docs: [] }];
  const duplicateCredits = duplicateSnapshot.docs.filter((doc) => doc.get("type") === "deposit" && Number(doc.get("deltaMinor")) > 0);
  report.push({
    provider: { transactionId: expected.transactionId, reference: expected.reference, status: "successful (provider-verified separately)", amountMinor: expected.amountMinor, currency: expected.currency },
    classification: classify({ intent, transaction, ledger, duplicates: duplicateCredits, expected }), ownerFingerprint: ownerFingerprint(owner),
    intent: selected(intent, ["provider", "amountMinor", "currency", "status", "providerTransactionId"]),
    walletTransaction: selected(transaction, ["type", "deltaMinor", "currency", "reference", "status", "balanceBeforeMinor", "balanceAfterMinor"]),
    walletLedger: selected(ledger, ["type", "deltaMinor", "currency", "reference", "balanceBeforeMinor", "balanceAfterMinor"]),
    paymentEvent: selected(event, ["status", "source", "sources", "reference", "providerTransactionId"]), callbackFailureReceipt: selected(callback, ["status", "reference", "providerTransactionId", "error"]),
    currentWallet: wallet ? selected(wallet, ["currency", "availableMinor", "reservedMinor", "balanceMinor", "version"]) : { exists: false }, referenceCreditCount: duplicateCredits.length,
    eventVariantIds: eventVariants.docs.map((doc) => doc.id),
    recentWalletHistory: historySnapshot.docs.map((doc) => ({ id: doc.id, type: doc.get("type") ?? null, deltaMinor: doc.get("deltaMinor") ?? null, currency: doc.get("currency") ?? null, reference: doc.get("reference") ?? null, balanceBeforeMinor: doc.get("balanceBeforeMinor") ?? null, balanceAfterMinor: doc.get("balanceAfterMinor") ?? null })),
    boundedReadLimits: { duplicateReferenceEntries: 10, eventVariants: 10, recentWalletEntries: 25 },
  });
}
console.log(JSON.stringify({ projectId: expectedProjectId, readOnly: true, generatedAt: new Date().toISOString(), transactions: report }, null, 2));
