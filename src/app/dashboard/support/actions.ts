"use server";

import { FieldValue } from "firebase-admin/firestore";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { sendAdminAlert, sendUserEmail } from "@/lib/email";

const ticketSchema = z.object({ orderId: z.string().trim().max(100).optional(), subject: z.string().trim().min(5).max(120), message: z.string().trim().min(15).max(2000) });

export async function createSupportTicket(formData: FormData) {
  const user = await requireUser();
  const input = ticketSchema.parse({ orderId: String(formData.get("orderId") || "") || undefined, subject: formData.get("subject"), message: formData.get("message") });
  const db = adminDb();
  if (input.orderId) { const order = await db.collection("orders").doc(input.orderId).get(); if (!order.exists || order.get("userId") !== user.uid) throw new Error("Order not found"); }
  const ticket = db.collection("supportTickets").doc();
  await ticket.create({ userId: user.uid, orderId: input.orderId || null, subject: input.subject, message: input.message, status: "open", priority: input.orderId ? "high" : "normal", source: "dashboard", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await db.collection("supportMessages").add({ ticketId: ticket.id, userId: user.uid, sender: "customer", message: input.message, createdAt: FieldValue.serverTimestamp() });
  await Promise.all([
    sendUserEmail(user.uid, { subject: `Support ticket #${ticket.id.slice(0, 8)} received`, title: "Support request received", message: `We received your request regarding ${input.orderId ? `order #${input.orderId.slice(0, 8)}` : "your account"}. Support will review the verified records and respond within 24 hours.`, buttonLabel: "View support", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/dashboard/support` }),
    sendAdminAlert({ subject: `Support ticket #${ticket.id.slice(0, 8)}: ${input.subject}`, title: input.orderId ? "Delivery issue reported" : "New support request", message: `${input.message}${input.orderId ? ` Order #${input.orderId.slice(0, 8)} requires review.` : ""}`, buttonLabel: "Open support inbox", buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/admin/support` }),
  ]).catch((error) => console.warn("[support-email] delivery failed", { ticketId: ticket.id, error: error instanceof Error ? error.message : "Unknown error" }));
  redirect(`/dashboard/support?notice=created&ticket=${ticket.id}`);
}
