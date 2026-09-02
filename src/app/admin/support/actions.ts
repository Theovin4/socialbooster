"use server";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { sendBrandedEmail, brandedEmail, sendUserEmail } from "@/lib/email";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";
import { storeSupportFiles, validateSupportFiles } from "@/lib/support-attachments";

const documentId = z.string().trim().min(1).max(180).regex(/^[a-zA-Z0-9_-]+$/);
const replySchema = z.object({ ticketId: documentId, message: z.string().trim().min(2).max(5000) });

export async function replyToInboundEmail(formData: FormData) {
  const admin = await requireAdmin();
  const input = replySchema.parse({ ticketId: formData.get("ticketId"), message: formData.get("message") });
  const ref = adminDb().collection("supportTickets").doc(input.ticketId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get("source") !== "inbound_email") throw new Error("Inbound support email not found");
  if (snapshot.get("status") === "closed") throw new Error("Reopen this conversation before replying.");
  const to = z.string().email().parse(snapshot.get("fromEmail"));
  await sendBrandedEmail({ to, subject: `Re: ${String(snapshot.get("subject") || "Your Social Booster support request")}`, html: brandedEmail({ title: "Support reply", preview: "Social Booster replied to your support request", message: input.message }) });
  await ref.set({ status: "open", lastMessage: input.message, lastSender: "admin", lastReply: input.message, repliedAt: FieldValue.serverTimestamp(), repliedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${input.ticketId}`);
  redirect(`/admin/support/${input.ticketId}?notice=replied`);
}

export async function replyToDashboardTicket(formData: FormData) {
  const admin = await requireAdmin();
  const input = replySchema.parse({ ticketId: formData.get("ticketId"), message: formData.get("message") });
  const files = await validateSupportFiles(formData);
  const db = adminDb();
  const ref = db.collection("supportTickets").doc(input.ticketId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get("source") === "inbound_email") throw new Error("Dashboard support ticket not found");
  if (snapshot.get("status") === "closed") throw new Error("Reopen this conversation before replying.");
  const userId = z.string().min(1).parse(snapshot.get("userId"));
  const message = db.collection("supportMessages").doc();
  const attachments = await storeSupportFiles(input.ticketId, message.id, files);
  const batch = db.batch();
  batch.create(message, { ticketId: input.ticketId, userId, sender: "admin", adminId: admin.uid, message: input.message, attachments, createdAt: FieldValue.serverTimestamp() });
  batch.set(ref, { status: "open", lastMessage: input.message, lastSender: "admin", lastReply: input.message, messageCount: FieldValue.increment(1), repliedAt: FieldValue.serverTimestamp(), repliedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  await sendUserEmail(userId, { subject: `Re: ${String(snapshot.get("subject") || "Your Social Booster support request")}`, title: "Support has replied", message: `${input.message}${attachments.length ? ` We also attached ${attachments.length} file(s) securely to your support conversation.` : ""}`, buttonLabel: "Open conversation", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/dashboard/tickets/${input.ticketId}` });
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${input.ticketId}`);
  revalidatePath("/dashboard/support");
  revalidatePath(`/dashboard/tickets/${input.ticketId}`);
  redirect(`/admin/support/${input.ticketId}?notice=replied`);
}

export async function setAdminTicketStatus(formData: FormData) {
  const admin = await requireAdmin();
  const ticketId = documentId.parse(formData.get("ticketId"));
  const status = z.enum(["open", "closed"]).parse(formData.get("status"));
  const ref = adminDb().collection("supportTickets").doc(ticketId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error("Support ticket not found");
  await ref.set({ status, statusChangedBy: admin.uid, statusChangedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), ...(status === "closed" ? { closedAt: FieldValue.serverTimestamp() } : { reopenedAt: FieldValue.serverTimestamp() }) }, { merge: true });
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/dashboard/support");
  revalidatePath(`/dashboard/tickets/${ticketId}`);
  redirect(`/admin/support/${ticketId}?notice=${status}`);
}
