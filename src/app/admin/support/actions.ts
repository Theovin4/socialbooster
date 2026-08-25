"use server";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sendBrandedEmail, brandedEmail } from "@/lib/email";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";

const replySchema = z.object({ ticketId: z.string().min(1).max(180), message: z.string().trim().min(10).max(5000) });

export async function replyToInboundEmail(formData: FormData) {
  const admin = await requireAdmin();
  const input = replySchema.parse({ ticketId: formData.get("ticketId"), message: formData.get("message") });
  const ref = adminDb().collection("supportTickets").doc(input.ticketId), snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get("source") !== "inbound_email") throw new Error("Inbound support email not found");
  const to = z.string().email().parse(snapshot.get("fromEmail"));
  await sendBrandedEmail({ to, subject: `Re: ${String(snapshot.get("subject") || "Your Social Booster support request")}`, html: brandedEmail({ title: "Support reply", preview: "Social Booster replied to your support request", message: input.message }) });
  await ref.set({ status: "replied", lastReply: input.message, repliedAt: FieldValue.serverTimestamp(), repliedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  revalidatePath("/admin/support");
}
