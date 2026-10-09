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
