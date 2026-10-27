import "server-only";
import { FieldPath, FieldValue, Timestamp, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { collectActiveOrderPages, prioritizeNeverChecked, type ActiveOrderCursor } from "./active-order-pages";
import { adminDb } from "./firebase/admin";
import { synchronizeOrderDocuments } from "./order-sync";

export const ACTIVE_ORDER_STATUSES = ["pending", "processing", "in_progress", "cancel_requested"] as const;
export const ACTIVE_ORDER_PAGE_SIZE = 100;
export const DEFAULT_ORDER_TRACKING_MAX_PER_RUN = 500;

function configuredMaximum(value = process.env.ORDER_TRACKING_MAX_PER_RUN) {
  const parsed = Number(value || DEFAULT_ORDER_TRACKING_MAX_PER_RUN);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 2_000) : DEFAULT_ORDER_TRACKING_MAX_PER_RUN;
}

function documentCursor(document: QueryDocumentSnapshot): ActiveOrderCursor {
  const createdAtMs = document.get("createdAt")?.toMillis?.();
  if (!Number.isFinite(createdAtMs)) throw new Error(`Active order ${document.id} has no valid creation timestamp`);
  return { createdAtMs, id: document.id };
}

function storedCursor(snapshot: FirebaseFirestore.DocumentSnapshot): ActiveOrderCursor | null {
  const createdAtMs = snapshot.get("nextCursorCreatedAt")?.toMillis?.();
  const id = snapshot.get("nextCursorId");
  return Number.isFinite(createdAtMs) && typeof id === "string" && id.length > 0 ? { createdAtMs, id } : null;
}

export type ActiveOrderSweepResult = {
  activeDiscovered: number;
  providerBackedDiscovered: number;
  checked: number;
  updated: number;
  completedDetected: number;
  partialDetected: number;
  stillActive: number;
  providerFailures: number;
  neverCheckedRemaining: number;
  providerBatches: number;
  queryPages: number;
  runDurationMs: number;
  checkedByProvider: Record<string, number>;
  transitions: Record<string, number>;
  estimatedFirestoreReads: number;
};

/** Shared bounded active-order sweeper used by cron, admin and catch-up. */
export async function synchronizeActiveOrders(input: { force?: boolean; maxOrders?: number; source: "cron" | "admin" | "catch_up" }) {
  const startedAt = Date.now();
  const db = adminDb();
  const healthRef = db.collection("trackingHealth").doc("current");
  const healthBefore = await healthRef.get();
  const initialCursor = storedCursor(healthBefore);
  const maxDocuments = input.maxOrders || configuredMaximum();
  const baseQuery = db.collection("orders")
    .where("status", "in", [...ACTIVE_ORDER_STATUSES])
    .orderBy("createdAt", "asc")
    .orderBy(FieldPath.documentId(), "asc");

  const collected = await collectActiveOrderPages<QueryDocumentSnapshot>({
    initialCursor,
    maxDocuments,
    pageSize: ACTIVE_ORDER_PAGE_SIZE,
    cursorFor: documentCursor,
    fetchPage: async (after, limit) => {
      let query: Query = baseQuery;
      if (after) query = query.startAfter(Timestamp.fromMillis(after.createdAtMs), after.id);
      return { documents: (await query.limit(limit).get()).docs };
    },
  });

  const providerBacked = collected.documents.filter((document) => Number.isInteger(document.get("providerOrderId")));
  const prioritized = prioritizeNeverChecked(providerBacked, (document) => document.get("lastProviderUpdate")?.toMillis?.() ?? null);
  const neverCheckedIds = new Set(prioritized.filter((document) => !document.get("lastProviderUpdate")?.toMillis?.()).map((document) => document.id));
  const synchronized = await synchronizeOrderDocuments(prioritized, input.force ?? true);
  const processedIds = new Set(synchronized.processedOrderIds);
  const neverCheckedRemaining = [...neverCheckedIds].filter((id) => !processedIds.has(id)).length;
  const completedDetected = Object.entries(synchronized.transitions).filter(([transition]) => transition.endsWith("->completed")).reduce((total, [, count]) => total + count, 0);
  const partialDetected = Object.entries(synchronized.transitions).filter(([transition]) => transition.endsWith("->partial")).reduce((total, [, count]) => total + count, 0);
  const stillActive = collected.documents.filter((document) => ACTIVE_ORDER_STATUSES.includes((synchronized.statusByOrder[document.id] || String(document.get("status"))) as typeof ACTIVE_ORDER_STATUSES[number])).length;
  const runDurationMs = Date.now() - startedAt;
  // Query reads + health read + one transactional order read per status transition.
  // Completion marketing/referral reads are intentionally excluded and reported as
  // variable because they depend on each customer's first-order/referral state.
  const estimatedFirestoreReads = collected.documents.length + 1 + synchronized.updated;
  const result: ActiveOrderSweepResult = {
    activeDiscovered: collected.documents.length,
    providerBackedDiscovered: providerBacked.length,
    checked: synchronized.checked,
    updated: synchronized.updated,
    completedDetected,
    partialDetected,
    stillActive,
    providerFailures: synchronized.providerFailures,
    neverCheckedRemaining,
    providerBatches: synchronized.providerBatches,
    queryPages: collected.pagesRead,
    runDurationMs,
    checkedByProvider: synchronized.checkedByProvider,
    transitions: synchronized.transitions,
    estimatedFirestoreReads,
  };

  await healthRef.set({
    lastRunAt: FieldValue.serverTimestamp(),
    lastRunSource: input.source,
    ...result,
    nextCursorCreatedAt: collected.nextCursor ? Timestamp.fromMillis(collected.nextCursor.createdAtMs) : null,
    nextCursorId: collected.nextCursor?.id || null,
    maxPerRun: maxDocuments,
  }, { merge: true });
  return result;
}
