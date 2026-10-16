import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase/admin";

export async function createCustomerNotification(input: { userId: string; type: string; title: string; orderId?: string }) {
  const db = adminDb(), notification = db.collection("notifications").doc(), summary = db.collection("notificationSummaries").doc(input.userId), batch = db.batch();
  batch.create(notification, { ...input, read: false, createdAt: FieldValue.serverTimestamp() });
  batch.set(summary, { unreadCount: FieldValue.increment(1), lastNotificationAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  return notification.id;
}

export async function createCustomerNotificationOnce(
  input: { userId: string; type: string; title: string; orderId?: string },
  idempotencyKey: string,
) {
  if (!/^[A-Za-z0-9:_-]{8,180}$/.test(idempotencyKey)) throw new Error("Invalid notification idempotency key");
  const db = adminDb(), notification = db.collection("notifications").doc(idempotencyKey), summary = db.collection("notificationSummaries").doc(input.userId);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(notification);
    if (existing.exists) return { id: notification.id, duplicate: true };
    transaction.create(notification, { ...input, read: false, createdAt: FieldValue.serverTimestamp() });
    transaction.set(summary, { unreadCount: FieldValue.increment(1), lastNotificationAt: FieldValue.serverTimestamp() }, { merge: true });
    return { id: notification.id, duplicate: false };
  });
}
