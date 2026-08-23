"use server";

import { FieldValue } from "firebase-admin/firestore";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";

const ticketSchema = z.object({ orderId: z.string().trim().max(100).optional(), subject: z.string().trim().min(5).max(120), message: z.string().trim().min(15).max(2000) });

export async function createSupportTicket(formData: FormData) {
  const user = await requireUser();
  const input = ticketSchema.parse({ orderId: String(formData.get("orderId") || "") || undefined, subject: formData.get("subject"), message: formData.get("message") });
  const db = adminDb();
  if (input.orderId) { const order = await db.collection("orders").doc(input.orderId).get(); if (!order.exists || order.get("userId") !== user.uid) throw new Error("Order not found"); }
  const ticket = db.collection("supportTickets").doc();
  await ticket.create({ userId: user.uid, orderId: input.orderId || null, subject: input.subject, status: "open", priority: input.orderId ? "high" : "normal", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await db.collection("supportMessages").add({ ticketId: ticket.id, userId: user.uid, sender: "customer", message: input.message, createdAt: FieldValue.serverTimestamp() });
  redirect(`/dashboard/support?notice=created&ticket=${ticket.id}`);
}
