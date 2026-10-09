"use server";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";

export async function markNotificationRead(formData: FormData) {
  const user = await requireUser(), id = String(formData.get("id") || "");
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) throw new Error("Invalid notification");
  const db = adminDb(), ref = db.collection("notifications").doc(id), summary = db.collection("notificationSummaries").doc(user.uid);
  await db.runTransaction(async (transaction) => {
    const [snapshot, summarySnapshot] = await Promise.all([transaction.get(ref), transaction.get(summary)]);
    if (!snapshot.exists || snapshot.get("userId") !== user.uid || snapshot.get("read") === true) return;
    transaction.set(ref, { read: true, readAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(summary, { unreadCount: Math.max(0, Number(summarySnapshot.get("unreadCount") || 0) - 1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  revalidatePath("/dashboard/notifications");
}
