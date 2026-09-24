import { FieldValue, Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "./admin";

export type OperationalTotals = {
  totalCustomers: number;
  joinedToday: number;
  totalOrders: number;
  lastUpdated: Date | null;
  todayKey: string;
  dailyCustomerJoins: Record<string, number>;
};

const STATS_COLLECTION = "stats";
const TOTALS_DOCUMENT = "totals";
const RECONCILIATION_VERSION = 2;

export function lagosDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function totalsDocument() {
  return adminDb().collection(STATS_COLLECTION).doc(TOTALS_DOCUMENT);
}

function numberValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function dailyValues(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key))
      .map(([key, count]) => [key, numberValue(count)]),
  );
}

function dateValue(value: unknown) {
  if (value instanceof Timestamp) return value.toDate();
  return value instanceof Date ? value : null;
}

/** Records a customer only when the caller has established that the profile is new. */
export function recordNewCustomer(
  transaction: Transaction,
  snapshot: DocumentSnapshot,
) {
  const todayKey = lagosDateKey();
  const dailyCustomerJoins = dailyValues(snapshot.get("dailyCustomerJoins"));
  dailyCustomerJoins[todayKey] = (dailyCustomerJoins[todayKey] || 0) + 1;
  const sameDay = snapshot.exists && snapshot.get("todayKey") === todayKey;

  transaction.set(snapshot.ref, {
    totalCustomers: FieldValue.increment(1),
    joinedToday: sameDay ? FieldValue.increment(1) : 1,
    todayKey,
    dailyCustomerJoins,
    lastUpdated: FieldValue.serverTimestamp(),
  }, { merge: true });
}

/** Records an order inside the same idempotent transaction that creates it. */
export function recordNewOrder(transaction: Transaction) {
  transaction.set(totalsDocument(), {
    totalOrders: FieldValue.increment(1),
    lastUpdated: FieldValue.serverTimestamp(),
  }, { merge: true });
}

/**
 * Rebuilds the counter from Firebase Authentication without reading every
 * Firestore customer profile. This is intentionally versioned so migrations
 * run once, while normal registrations keep the one-document counter current.
 */
export async function reconcileOperationalTotals() {
  const db = adminDb();
  const ref = totalsDocument();
  const todayKey = lagosDateKey();
  const dailyCustomerJoins: Record<string, number> = {};
  let totalCustomers = 0;
  let pageToken: string | undefined;

  do {
    const page = await adminAuth().listUsers(1_000, pageToken);
    for (const user of page.users) {
      if (user.customClaims?.admin === true) continue;
      totalCustomers += 1;
      const createdAt = new Date(user.metadata.creationTime);
      if (!Number.isNaN(createdAt.getTime())) {
        const key = lagosDateKey(createdAt);
        dailyCustomerJoins[key] = (dailyCustomerJoins[key] || 0) + 1;
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  const orders = await db.collection("orders").count().get();
  const totalOrders = numberValue(orders.data().count);
  await ref.set({
    initialized: true,
    reconciliationVersion: RECONCILIATION_VERSION,
    totalCustomers,
    joinedToday: dailyCustomerJoins[todayKey] || 0,
    totalOrders,
    todayKey,
    dailyCustomerJoins,
    lastReconciledAt: FieldValue.serverTimestamp(),
    lastUpdated: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { totalCustomers, totalOrders, joinedToday: dailyCustomerJoins[todayKey] || 0 };
}

/** One normal document read. Aggregate counts run once only when the counter is first introduced. */
export async function getOperationalTotals(): Promise<OperationalTotals> {
  const ref = totalsDocument();
  let snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get("initialized") !== true || numberValue(snapshot.get("reconciliationVersion")) < RECONCILIATION_VERSION) {
    await reconcileOperationalTotals();
    snapshot = await ref.get();
  }

  const todayKey = lagosDateKey();
  const isCurrentDay = snapshot.get("todayKey") === todayKey;
  return {
    totalCustomers: numberValue(snapshot.get("totalCustomers")),
    joinedToday: isCurrentDay ? numberValue(snapshot.get("joinedToday")) : 0,
    totalOrders: numberValue(snapshot.get("totalOrders")),
    lastUpdated: dateValue(snapshot.get("lastUpdated")),
    todayKey,
    dailyCustomerJoins: dailyValues(snapshot.get("dailyCustomerJoins")),
  };
}

/** Resets only when the stored counter belongs to a previous Lagos calendar day. */
export async function resetJoinedToday() {
  const db = adminDb();
  const ref = totalsDocument();
  const todayKey = lagosDateKey();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.get("todayKey") === todayKey) return { reset: false, todayKey };
    transaction.set(ref, {
      joinedToday: 0,
      todayKey,
      lastUpdated: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { reset: true, todayKey };
  });
}
