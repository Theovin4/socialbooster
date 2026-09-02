"use server";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { sendAdminAlert, sendUserEmail } from "@/lib/email";
import { storeSupportFiles, validateSupportFiles } from "@/lib/support-attachments";

const documentId = z.string().trim().min(1).max(180).regex(/^[a-zA-Z0-9_-]+$/);
const ticketSchema = z.object({ orderId: documentId.optional(), subject: z.string().trim().min(5).max(120), message: z.string().trim().min(15).max(3000) });
const replySchema = z.object({ ticketId: documentId, message: z.string().trim().min(2).max(5000) });

async function customerTicket(ticketId: string, userId: string) {
  const ref = adminDb().collection("supportTickets").doc(ticketId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get("userId") !== userId || snapshot.get("source") === "inbound_email") throw new Error("Support ticket not found");
  return { ref, snapshot };
}

export async function createSupportTicket(formData: FormData) {
  const user = await requireUser();
  const input = ticketSchema.parse({ orderId: String(formData.get("orderId") || "") || undefined, subject: formData.get("subject"), message: formData.get("message") });
  const files = await validateSupportFiles(formData);
  const db = adminDb();
  if (input.orderId) {
    const order = await db.collection("orders").doc(input.orderId).get();
    if (!order.exists || order.get("userId") !== user.uid) throw new Error("Order not found");
  }
  const ticket = db.collection("supportTickets").doc();
  const message = db.collection("supportMessages").doc();
  const attachments = await storeSupportFiles(ticket.id, message.id, user.uid, files);
  const batch = db.batch();
  batch.create(ticket, { userId: user.uid, orderId: input.orderId || null, subject: input.subject, message: input.message, status: "open", priority: input.orderId ? "high" : "normal", source: "dashboard", messageCount: 1, lastMessage: input.message, lastSender: "customer", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  batch.create(message, { ticketId: ticket.id, userId: user.uid, sender: "customer", message: input.message, attachments, createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  await Promise.all([
    sendUserEmail(user.uid, { subject: `Support ticket #${ticket.id.slice(0, 8)} received`, title: "Support request received", message: `We received your request regarding ${input.orderId ? `order #${input.orderId.slice(0, 8)}` : "your account"}. Support will review the verified records and respond within 24 hours.`, buttonLabel: "Open ticket", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/dashboard/tickets/${ticket.id}` }),
    sendAdminAlert({ subject: `Support ticket #${ticket.id.slice(0, 8)}: ${input.subject}`, title: input.orderId ? "Delivery issue reported" : "New support request", message: `${input.message}${attachments.length ? ` ${attachments.length} attachment(s) included.` : ""}${input.orderId ? ` Order #${input.orderId.slice(0, 8)} requires review.` : ""}`, buttonLabel: "Open ticket", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/admin/support/${ticket.id}` }),
  ]).catch((error) => console.warn("[support-email] delivery failed", { ticketId: ticket.id, error: error instanceof Error ? error.message : "Unknown error" }));
  redirect(`/dashboard/tickets/${ticket.id}?notice=created`);
}

export async function replyToSupportTicket(formData: FormData) {
  const user = await requireUser();
  const input = replySchema.parse({ ticketId: formData.get("ticketId"), message: formData.get("message") });
  const files = await validateSupportFiles(formData);
  const { ref, snapshot } = await customerTicket(input.ticketId, user.uid);
  if (snapshot.get("status") === "closed") throw new Error("Reopen this ticket before replying.");
  const db = adminDb();
  const message = db.collection("supportMessages").doc();
  const attachments = await storeSupportFiles(input.ticketId, message.id, user.uid, files);
  const batch = db.batch();
  batch.create(message, { ticketId: input.ticketId, userId: user.uid, sender: "customer", message: input.message, attachments, createdAt: FieldValue.serverTimestamp() });
  batch.set(ref, { status: "open", lastMessage: input.message, lastSender: "customer", messageCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  await sendAdminAlert({ subject: `Customer replied to ticket #${input.ticketId.slice(0, 8)}`, title: "Support reply received", message: `${input.message}${attachments.length ? ` ${attachments.length} attachment(s) included.` : ""}`, buttonLabel: "Open ticket", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/admin/support/${input.ticketId}` }).catch(() => undefined);
  revalidatePath(`/dashboard/tickets/${input.ticketId}`);
  redirect(`/dashboard/tickets/${input.ticketId}?notice=replied`);
}

export async function setCustomerTicketStatus(formData: FormData) {
  const user = await requireUser();
  const ticketId = documentId.parse(formData.get("ticketId"));
  const status = z.enum(["open", "closed"]).parse(formData.get("status"));
  const { ref } = await customerTicket(ticketId, user.uid);
  await ref.set({ status, statusChangedBy: user.uid, statusChangedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), ...(status === "closed" ? { closedAt: FieldValue.serverTimestamp() } : { reopenedAt: FieldValue.serverTimestamp() }) }, { merge: true });
  revalidatePath("/dashboard/support");
  revalidatePath(`/dashboard/tickets/${ticketId}`);
  redirect(`/dashboard/tickets/${ticketId}?notice=${status}`);
}
