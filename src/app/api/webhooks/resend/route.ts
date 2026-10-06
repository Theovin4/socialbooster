import { FieldValue } from "firebase-admin/firestore";
import { Webhook } from "svix";
import { adminDb } from "@/lib/firebase/admin";

type ReceivedEvent = {
  type: string;
  created_at?: string;
  data?: { email_id?: string; email?: string; from?: string; to?: string[]; subject?: string; broadcast_id?: string; attachments?: Array<{ filename?: string; content_type?: string }> };
};

function plainText(value: unknown) {
  return String(value || "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, 10_000);
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_SECRET_KEY || process.env.RESEND_WEBHOOK_SECRET;
  const apiKey = process.env.RESEND_API_KEY;
  if (!secret || !apiKey) return new Response("Inbound email is not configured", { status: 503 });
  const id = request.headers.get("svix-id"), timestamp = request.headers.get("svix-timestamp"), signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return new Response("Missing webhook signature", { status: 400 });
  const payload = await request.text();
  let event: ReceivedEvent;
  try { event = new Webhook(secret).verify(payload, { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": signature }) as ReceivedEvent; }
  catch { return new Response("Invalid webhook signature", { status: 400 }); }
  const db = adminDb(), eventRef = db.collection("resendWebhookEvents").doc(id);
  const claimed = await eventRef.create({ type: event.type, createdAt: FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + 90 * 86_400_000) }).then(() => true).catch(() => false);
  if (!claimed) return Response.json({ received: true, duplicate: true });

  const suppressionStatus = event.type === "contact.unsubscribed" ? "unsubscribed" : event.type === "email.bounced" ? "bounced" : event.type === "email.complained" ? "complained" : event.type === "email.suppressed" ? "suppressed" : null;
  if (suppressionStatus) {
    const recipients = [...new Set([event.data?.email, ...(event.data?.to || [])].filter((value): value is string => Boolean(value)).map((value) => value.trim().toLowerCase()))];
    for (const email of recipients.slice(0, 10)) {
      const matches = await db.collection("marketingProfiles").where("email", "==", email).limit(2).get();
      await Promise.all(matches.docs.map((profile) => profile.ref.set({
        marketingEligible: false,
        marketingConsent: suppressionStatus === "unsubscribed" ? false : profile.get("marketingConsent") === true,
        marketingStatus: suppressionStatus === "unsubscribed" ? "unsubscribed" : "suppressed",
        emailStatus: suppressionStatus === "unsubscribed" ? String(profile.get("emailStatus") || "active") : suppressionStatus,
        suppressionSource: "resend_webhook",
        suppressionEventId: id,
        suppressedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })));
    }
  }
  if (event.type.startsWith("email.") && event.type !== "email.received" && event.data?.email_id) {
    // Resend remains the source of truth for campaign-level delivery analytics.
    // Only update an application delivery audit that already exists; never create
    // one Firestore document per marketing recipient event.
    const delivery = db.collection("emailDeliveries").doc(event.data.email_id);
    if ((await delivery.get()).exists) await delivery.set({ status: event.type.replace("email.", ""), lastEventId: id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return Response.json({ received: true });
  }
  if (event.type !== "email.received" || !event.data?.email_id) return Response.json({ received: true });

  const ref = db.collection("supportTickets").doc(`resend-${event.data.email_id}`);
  if ((await ref.get()).exists) return Response.json({ received: true, duplicate: true });
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(event.data.email_id)}`, { headers: { authorization: `Bearer ${apiKey}` }, cache: "no-store" });
  if (!response.ok) return new Response("Unable to retrieve received email", { status: 502 });
  const email = await response.json() as { from?: string; to?: string[]; subject?: string; text?: string | null; html?: string | null; attachments?: Array<{ filename?: string; content_type?: string }> };
  const message = plainText(email.text || email.html || "No message body");
  await ref.create({
    source: "inbound_email", resendEmailId: event.data.email_id, webhookEventId: id,
    fromEmail: String(email.from || event.data.from || "unknown"), recipients: email.to || event.data.to || [],
    subject: String(email.subject || event.data.subject || "Email support request").slice(0, 200),
    message, lastMessage: message, lastSender: "customer", messageCount: 1,
    attachments: (email.attachments || event.data.attachments || []).slice(0, 20).map((item) => ({ filename: String(item.filename || "attachment").slice(0, 200), contentType: String(item.content_type || "application/octet-stream").slice(0, 100) })),
    priority: "normal", status: "open", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  return Response.json({ received: true });
}
