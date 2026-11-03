import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { classifyFlutterwaveDiagnostic } from "./diagnostics";

const MAX_RESULTS = 5;
const MAX_MATCHES_PER_QUERY = 10;
const MAX_ACTIVITY = 25;

type Snapshot = FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot;
type Candidate = { reference: string | null; transactionId: string | null };

function transactionIdFrom(documentId: string, data: FirebaseFirestore.DocumentData) {
  if (typeof data.providerTransactionId === "string" && data.providerTransactionId) return data.providerTransactionId;
  if (typeof data.transactionId === "string" && data.transactionId.startsWith("flutterwave:")) return data.transactionId.slice("flutterwave:".length);
  return documentId.startsWith("flutterwave:") ? documentId.slice("flutterwave:".length) : null;
}

function addCandidate(candidates: Map<string, Candidate>, reference: unknown, transactionId: unknown) {
  const ref = typeof reference === "string" && reference ? reference : null;
  const id = typeof transactionId === "string" && transactionId ? transactionId : null;
  if (!ref && !id) return;
  const existing = [...candidates.entries()].find(([, candidate]) =>
    Boolean((ref && candidate.reference === ref) || (id && candidate.transactionId === id)));
  if (existing) candidates.delete(existing[0]);
  const combined = { reference: ref || existing?.[1].reference || null, transactionId: id || existing?.[1].transactionId || null };
  candidates.set(combined.reference ? `reference:${combined.reference}` : `transaction:${combined.transactionId}`, combined);
}

function snapshotFields(snapshot: Snapshot | null, fields: string[]): Record<string, unknown> | null {
  if (!snapshot?.exists) return null;
  const data = snapshot.data() || {};
  return Object.fromEntries(fields.map((field) => [field, data[field] ?? null]));
}

function isoDate(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function plainActivity(snapshot: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    type: data.type ?? null,
    deltaMinor: Number.isFinite(Number(data.deltaMinor)) ? Number(data.deltaMinor) : null,
    currency: data.currency ?? null,
    reason: data.reason ?? null,
    reference: data.reference ?? null,
    createdAt: isoDate(data.createdAt),
  };
}

async function snapshotsByField(collection: FirebaseFirestore.CollectionReference, field: string, value: string) {
  return collection.where(field, "==", value).limit(MAX_MATCHES_PER_QUERY).get();
}

export async function getFlutterwavePaymentDiagnostics(rawQuery: string) {
  const query = rawQuery.trim();
  const db = adminDb();
  const candidates = new Map<string, Candidate>();
  let matchedEmail: string | null = null;
  let userId: string | null = null;

  if (/^\d{1,32}$/.test(query)) {
    const transactionId = query;
    const key = `flutterwave:${transactionId}`;
    const [transaction, ledger, event, intents, transactionsById, ledgersById, eventsById] = await Promise.all([
      db.collection("walletTransactions").doc(key).get(),
      db.collection("walletLedger").doc(key).get(),
      db.collection("paymentEvents").doc(key).get(),
      snapshotsByField(db.collection("paymentIntents"), "providerTransactionId", transactionId),
      snapshotsByField(db.collection("walletTransactions"), "providerTransactionId", transactionId),
      snapshotsByField(db.collection("walletLedger"), "providerTransactionId", transactionId),
      snapshotsByField(db.collection("paymentEvents"), "providerTransactionId", transactionId),
    ]);
    for (const snapshot of [transaction, ledger, event, ...transactionsById.docs, ...ledgersById.docs, ...eventsById.docs]) {
      const data = snapshot.data() || {};
      addCandidate(candidates, data.reference, transactionIdFrom(snapshot.id, data) || transactionId);
    }
    for (const snapshot of intents.docs) addCandidate(candidates, snapshot.id, transactionId);
  } else if (query.startsWith("flw_")) {
    const [intent, transactions, ledgers, events] = await Promise.all([
      db.collection("paymentIntents").doc(query).get(),
      snapshotsByField(db.collection("walletTransactions"), "reference", query),
      snapshotsByField(db.collection("walletLedger"), "reference", query),
      snapshotsByField(db.collection("paymentEvents"), "reference", query),
    ]);
    addCandidate(candidates, query, null);
    for (const snapshot of [intent, ...transactions.docs, ...ledgers.docs, ...events.docs]) {
      const data = snapshot.data() || {};
      addCandidate(candidates, query, transactionIdFrom(snapshot.id, data));
    }
  } else {
    if (query.includes("@")) {
      try {
        const account = await adminAuth().getUserByEmail(query);
        userId = account.uid;
        matchedEmail = account.email || query;
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "auth/user-not-found") {
          return { error: "No customer account matches that email address.", matches: [] };
        }
        throw error;
      }
    } else {
      userId = query;
    }

    const [intents, recentTransactions] = await Promise.all([
      db.collection("paymentIntents").where("userId", "==", userId).where("provider", "==", "flutterwave").limit(MAX_RESULTS).get(),
      db.collection("walletTransactions").where("userId", "==", userId).orderBy("createdAt", "desc").limit(MAX_ACTIVITY).get(),
    ]);
    for (const snapshot of intents.docs) {
      addCandidate(candidates, snapshot.id, transactionIdFrom(snapshot.id, snapshot.data()));
    }
    for (const snapshot of recentTransactions.docs) {
      const data = snapshot.data();
      if (snapshot.id.startsWith("flutterwave:") || String(data.reference || "").startsWith("flw_")) {
        addCandidate(candidates, data.reference, transactionIdFrom(snapshot.id, data));
      }
    }
  }

  const selectedCandidates = [...candidates.values()].slice(0, MAX_RESULTS);
  const matches = await Promise.all(selectedCandidates.map(async (candidate) => {
    const reference = candidate.reference;
    const id = candidate.transactionId;
    const canonicalTransactionId = id ? `flutterwave:${id}` : null;
    const [intent, canonicalTransaction, transactionsByReference, canonicalLedger, ledgersByReference, canonicalEvent, eventsById, eventsByReference] = await Promise.all([
      reference ? db.collection("paymentIntents").doc(reference).get() : Promise.resolve(null),
      canonicalTransactionId ? db.collection("walletTransactions").doc(canonicalTransactionId).get() : Promise.resolve(null),
      reference ? snapshotsByField(db.collection("walletTransactions"), "reference", reference) : Promise.resolve(null),
      canonicalTransactionId ? db.collection("walletLedger").doc(canonicalTransactionId).get() : Promise.resolve(null),
      reference ? snapshotsByField(db.collection("walletLedger"), "reference", reference) : Promise.resolve(null),
      canonicalTransactionId ? db.collection("paymentEvents").doc(canonicalTransactionId).get() : Promise.resolve(null),
      id ? snapshotsByField(db.collection("paymentEvents"), "providerTransactionId", id) : Promise.resolve(null),
      reference ? snapshotsByField(db.collection("paymentEvents"), "reference", reference) : Promise.resolve(null),
    ]);
    const transaction = canonicalTransaction?.exists
      ? canonicalTransaction
      : transactionsByReference?.docs.find((snapshot) => snapshot.id.startsWith("flutterwave:")) || transactionsByReference?.docs[0] || null;
    const transactionData = transaction?.data() || {};
    const transactionId = id || (transaction ? transactionIdFrom(transaction.id, transactionData) : null);
    const ledger = canonicalLedger?.exists
      ? canonicalLedger
      : ledgersByReference?.docs.find((snapshot) => String(snapshot.get("transactionId") || "").startsWith("flutterwave:")) || ledgersByReference?.docs[0] || null;
    const owner = String(intent?.get("userId") || transactionData.userId || ledger?.get("walletUserId") || "");
    const [wallet, subsequent] = await Promise.all([
      owner ? db.collection("wallets").doc(owner).get() : Promise.resolve(null),
      owner && transactionData.createdAt
        ? db.collection("walletTransactions").where("userId", "==", owner).where("createdAt", ">", transactionData.createdAt).orderBy("createdAt", "asc").limit(MAX_ACTIVITY).get()
        : Promise.resolve(null),
    ]);
    const eventSnapshots = [canonicalEvent, ...(eventsById?.docs || []), ...(eventsByReference?.docs || [])].filter((snapshot): snapshot is FirebaseFirestore.DocumentSnapshot => Boolean(snapshot?.exists));
    const uniqueEvents = [...new Map(eventSnapshots.map((snapshot) => [snapshot.id, snapshot])).values()];
    const intentData = intent?.data() || null;
    const canonicalIntent = intentData ? { ...intentData, reference: reference || intent?.id } : null;
    const subsequentActivity = (subsequent?.docs || []).map(plainActivity);
    const transactionFields: Record<string, unknown> | null = transaction ? {
      id: transaction.id,
      ...snapshotFields(transaction, ["userId", "type", "deltaMinor", "currency", "reference", "status", "providerTransactionId", "balanceBeforeMinor", "balanceAfterMinor", "createdAt"]),
      createdAt: isoDate(transaction.get("createdAt")),
    } : null;
    const ledgerFields: Record<string, unknown> | null = ledger ? {
      id: ledger.id,
      ...snapshotFields(ledger, ["walletUserId", "transactionId", "type", "deltaMinor", "currency", "reference", "providerTransactionId", "balanceBeforeMinor", "balanceAfterMinor", "createdAt"]),
      createdAt: isoDate(ledger.get("createdAt")),
    } : null;
    const walletFields: Record<string, unknown> | null = snapshotFields(wallet, ["currency", "availableMinor", "reservedMinor", "balanceMinor", "version"]);
    const walletResult: Record<string, unknown> = wallet ? { exists: wallet.exists, ...(walletFields || {}) } : { exists: false };
    const classification = classifyFlutterwaveDiagnostic({
      providerTransactionId: transactionId,
      intent: canonicalIntent,
      transaction: transactionFields,
      ledger: ledgerFields,
      wallet: walletFields,
      subsequentActivity,
    });
    const paymentEvents: Array<Record<string, unknown>> = uniqueEvents.map((event) => ({
      id: event.id,
      ...snapshotFields(event, ["status", "source", "sources", "reference", "providerTransactionId", "receivedAt", "processedAt"]),
      receivedAt: isoDate(event.get("receivedAt")),
      processedAt: isoDate(event.get("processedAt")),
    }));

    return {
      providerTransaction: {
        provider: "flutterwave",
        transactionId: transactionId || (typeof intentData?.providerTransactionId === "string" ? intentData.providerTransactionId : null),
        verification: "Not live-verified by this read-only diagnostic",
      },
      reference: reference || (typeof intentData?.reference === "string" ? intentData.reference : null),
      userId: owner || null,
      customerEmail: matchedEmail,
      paymentIntent: intentData ? {
        exists: true,
        provider: intentData.provider ?? null,
        userId: intentData.userId ?? null,
        expectedAmountMinor: intentData.amountMinor ?? null,
        currency: intentData.currency ?? null,
        status: intentData.status ?? null,
        providerTransactionId: intentData.providerTransactionId ?? null,
      } : { exists: false },
      walletDeposit: transactionFields,
      walletLedger: ledgerFields,
      wallet: walletResult,
      subsequentWalletActivity: {
        entries: subsequentActivity,
        limit: MAX_ACTIVITY,
        truncatedAtLimit: subsequentActivity.length === MAX_ACTIVITY,
        evidenceAvailable: Boolean(transactionData.createdAt),
      },
      paymentEvents,
      finalClassification: classification,
    };
  }));

  return {
    matches,
    truncated: candidates.size > MAX_RESULTS,
    message: matches.length ? null : "No Flutterwave payment records matched that search.",
  };
}
