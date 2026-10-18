import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase/admin";
import { sendAdminAlert } from "./email";
import { normalizeProviderKey } from "./providers";

export const PROVIDER_AMBIGUOUS_WINDOW_MS = 15 * 60 * 1000;
export const PROVIDER_AMBIGUOUS_THRESHOLD = 3;

export type ProviderHealthState = { status?: unknown; windowStartedAtMs?: unknown; ambiguousCount?: unknown };

export function nextProviderHealthState(current: ProviderHealthState, nowMs: number) {
  const started = Number(current.windowStartedAtMs || 0);
  const inWindow = Number.isFinite(started) && started > 0 && nowMs - started <= PROVIDER_AMBIGUOUS_WINDOW_MS;
  const ambiguousCount = (inWindow ? Math.max(0, Number(current.ambiguousCount || 0)) : 0) + 1;
  return {
    status: ambiguousCount >= PROVIDER_AMBIGUOUS_THRESHOLD ? "DEGRADED" as const : String(current.status || "ACTIVE"),
    windowStartedAtMs: inWindow ? started : nowMs,
    ambiguousCount,
    becameDegraded: String(current.status || "ACTIVE") !== "DEGRADED" && ambiguousCount >= PROVIDER_AMBIGUOUS_THRESHOLD,
  };
}

export function providerAcceptsNewOrders(health: ProviderHealthState | undefined) {
  return String(health?.status || "ACTIVE") !== "DEGRADED";
}

export async function recordAmbiguousProviderSubmission(input: { providerKey: string; orderId: string; attempt: number }) {
  const providerKey = normalizeProviderKey(input.providerKey), db = adminDb();
  const eventRef = db.collection("providerSubmissionEvents").doc(`${input.orderId}:${input.attempt}`);
  const healthRef = db.collection("providerOrderHealth").doc(providerKey);
  const result = await db.runTransaction(async (transaction) => {
    const [event, health] = await Promise.all([transaction.get(eventRef), transaction.get(healthRef)]);
    if (event.exists) return { duplicate: true, becameDegraded: false };
    const nowMs = Date.now();
    const next = nextProviderHealthState({
      status: health.get("status"),
      windowStartedAtMs: health.get("windowStartedAt")?.toMillis?.(),
      ambiguousCount: health.get("ambiguousCount"),
    }, nowMs);
    transaction.create(eventRef, { providerKey, orderId: input.orderId, attempt: input.attempt, outcome: "AMBIGUOUS", createdAt: FieldValue.serverTimestamp() });
    transaction.set(healthRef, {
      status: next.status,
      ambiguousCount: next.ambiguousCount,
      windowStartedAt: new Date(next.windowStartedAtMs),
      lastAmbiguousAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(next.becameDegraded ? { degradedAt: FieldValue.serverTimestamp(), degradationReason: "repeated_ambiguous_submissions" } : {}),
    }, { merge: true });
    return { duplicate: false, becameDegraded: next.becameDegraded };
  });
  if (result.becameDegraded) {
    await Promise.allSettled([
      db.collection("operationsAlerts").doc(`provider_orders_${providerKey}`).set({ active: true, severity: "critical", providerKey, reason: "repeated_ambiguous_submissions", updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      sendAdminAlert({ subject: "Provider order submissions degraded", title: "Provider temporarily paused", message: "Repeated uncertain order submissions were detected. New orders for the affected provider are blocked until an administrator completes a successful health verification.", buttonLabel: "Review provider health", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/admin/provider` }),
    ]);
  }
  return result;
}
