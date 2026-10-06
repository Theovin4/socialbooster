"use server";

import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/firebase/session";
import { adminDb } from "@/lib/firebase/admin";
import { MARKETING_CAMPAIGN_COLLECTION, isMarketingSegment, isMarketingTemplate, isMarketingTopic, marketingSendingEnabled, type MarketingSegmentId, type MarketingTopicId } from "@/lib/marketing";
import { marketingSegmentCount } from "@/lib/marketing-admin";
import { renderMarketingEmail } from "@/lib/marketing-email";
import { sendBrandedEmail } from "@/lib/email";
import { cancelResendBroadcast, createResendBroadcastDraft, resendSegmentId, scheduleResendBroadcast } from "@/lib/resend-marketing";

const draftSchema = z.object({
  name: z.string().trim().min(3).max(100),
  templateId: z.string().refine(isMarketingTemplate),
  segment: z.string().refine(isMarketingSegment),
  topic: z.string().optional().refine((value) => !value || isMarketingTopic(value)),
  subject: z.string().trim().min(3).max(120),
  preheader: z.string().trim().max(180).optional(),
  heading: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(2_000),
  ctaText: z.string().trim().min(2).max(60),
  ctaUrl: z.string().trim().min(1).max(300),
});

function validateCampaignSubject(subject: string) {
  if (/^(re|fwd):/i.test(subject)) throw new Error("Deceptive reply or forward prefixes are not allowed");
  const letters = subject.replace(/[^a-z]/gi, "");
  if (letters.length >= 8 && subject === subject.toUpperCase()) throw new Error("All-caps subject lines are not allowed");
  if (/[!?]{3,}/.test(subject)) throw new Error("Excessive punctuation is not allowed");
}

async function auditMarketingAction(adminId: string, action: string, campaignId: string, details: Record<string, unknown> = {}) {
  await adminDb().collection("adminAuditLogs").add({ adminId, action, campaignId, ...details, createdAt: FieldValue.serverTimestamp() });
}

export async function saveCampaignDraft(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = draftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/email-marketing/create?notice=invalid");
  validateCampaignSubject(parsed.data.subject);
  const campaignId = randomUUID();
  const recipientCount = await marketingSegmentCount(parsed.data.segment);
  const rendered = renderMarketingEmail({ ...parsed.data, campaignId });
  await adminDb().collection(MARKETING_CAMPAIGN_COLLECTION).doc(campaignId).create({
    ...parsed.data,
    subject: rendered.subject,
    preheader: rendered.preheader,
    ctaUrl: rendered.ctaUrl,
    recipientCount,
    status: "draft",
    sendingEnabledAtCreation: marketingSendingEnabled(),
    createdBy: admin.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await auditMarketingAction(admin.uid, "marketing_campaign_created", campaignId, { segment: parsed.data.segment, templateId: parsed.data.templateId });
  revalidatePath("/admin/email-marketing");
  redirect(`/admin/email-marketing/campaigns?notice=draft-created&id=${campaignId}`);
}

export async function createProviderDraft(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid campaign reference");
  const ref = adminDb().collection(MARKETING_CAMPAIGN_COLLECTION).doc(id), snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get("status") !== "draft") throw new Error("Campaign draft not found");
  const segment = String(snapshot.get("segment")) as MarketingSegmentId;
  if (!resendSegmentId(segment)) throw new Error(`The Resend segment for ${segment.replaceAll("_", " ")} is not configured`);
  const rendered = renderMarketingEmail({
    campaignId: id,
    templateId: snapshot.get("templateId"),
    subject: snapshot.get("subject"),
    preheader: snapshot.get("preheader"),
    heading: snapshot.get("heading"),
    body: snapshot.get("body"),
    ctaText: snapshot.get("ctaText"),
    ctaUrl: snapshot.get("ctaUrl"),
  });
  const result = await createResendBroadcastDraft({ name: snapshot.get("name"), subject: rendered.subject, preheader: rendered.preheader, html: rendered.html, segment, topic: (snapshot.get("topic") || undefined) as MarketingTopicId | undefined, idempotencyKey: `marketing-broadcast-draft-${id}` });
  await ref.set({ providerBroadcastId: result.id, providerDraftCreatedBy: admin.uid, providerDraftCreatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await auditMarketingAction(admin.uid, "marketing_provider_draft_created", id, { segment });
  revalidatePath("/admin/email-marketing/campaigns");
  redirect("/admin/email-marketing/campaigns?notice=provider-draft-created");
}

export async function cancelCampaign(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid campaign reference");
  const ref = adminDb().collection(MARKETING_CAMPAIGN_COLLECTION).doc(id), snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get("status") === "sent") throw new Error("Campaign cannot be cancelled");
  const providerId = String(snapshot.get("providerBroadcastId") || "");
  if (providerId && snapshot.get("status") === "scheduled") await cancelResendBroadcast(providerId);
  await ref.set({ status: "cancelled", cancelledBy: admin.uid, cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await auditMarketingAction(admin.uid, "marketing_campaign_cancelled", id);
  revalidatePath("/admin/email-marketing/campaigns");
}

export async function scheduleCampaign(formData: FormData) {
  const admin = await requireAdmin();
  if (!marketingSendingEnabled()) throw new Error("Production marketing sends are disabled");
  if (formData.get("confirmed") !== "yes") throw new Error("Explicit scheduling confirmation is required");
  const id = String(formData.get("id") || ""), scheduled = new Date(String(formData.get("scheduledAt") || ""));
  if (!/^[0-9a-f-]{36}$/.test(id) || Number.isNaN(scheduled.getTime()) || scheduled.getTime() < Date.now() + 10 * 60_000) throw new Error("Choose a valid schedule at least ten minutes in the future");
  const db = adminDb(), ref = db.collection(MARKETING_CAMPAIGN_COLLECTION).doc(id), snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get("status") !== "draft" || !snapshot.get("providerBroadcastId")) throw new Error("A reviewed provider draft is required");
  const segment = String(snapshot.get("segment")) as MarketingSegmentId;
  if (!resendSegmentId(segment)) throw new Error("The selected Resend segment is not configured");
  const recent = await db.collection(MARKETING_CAMPAIGN_COLLECTION).where("status", "==", "scheduled").where("scheduledAt", ">=", new Date(Date.now() - 86_400_000)).limit(1).get();
  if (!recent.empty) throw new Error("The campaign frequency cap allows only one scheduled broadcast per 24 hours");
  const recipientCount = await marketingSegmentCount(segment);
  if (recipientCount <= 0) throw new Error("The eligible audience is empty");
  if (recipientCount >= 1_000 && formData.get("largeConfirmed") !== "yes") throw new Error("Large campaigns require the additional audience confirmation");
  await scheduleResendBroadcast(String(snapshot.get("providerBroadcastId")), scheduled.toISOString());
  await ref.set({ status: "scheduled", scheduledAt: scheduled, scheduledBy: admin.uid, recipientCountAtSchedule: recipientCount, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await auditMarketingAction(admin.uid, "marketing_campaign_scheduled", id, { segment, recipientCount, scheduledAt: scheduled });
  revalidatePath("/admin/email-marketing/campaigns");
  redirect("/admin/email-marketing/campaigns?notice=scheduled");
}

export async function sendCampaignTest(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || ""), recipient = String(formData.get("recipient") || "").trim().toLowerCase();
  const allowed = new Set((process.env.EMAIL_TEST_RECIPIENTS || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
  if (!allowed.has(recipient)) throw new Error("That address is not in the approved test-recipient list");
  const snapshot = await adminDb().collection(MARKETING_CAMPAIGN_COLLECTION).doc(id).get();
  if (!snapshot.exists) throw new Error("Campaign draft not found");
  const rendered = renderMarketingEmail({ campaignId: id, templateId: snapshot.get("templateId"), subject: snapshot.get("subject"), preheader: snapshot.get("preheader"), heading: snapshot.get("heading"), body: snapshot.get("body"), ctaText: snapshot.get("ctaText"), ctaUrl: snapshot.get("ctaUrl") });
  await sendBrandedEmail({ to: recipient, subject: `[TEST] ${rendered.subject}`, html: rendered.html.replaceAll("{{{FIRST_NAME|there}}}", "Admin").replaceAll("{{{RESEND_UNSUBSCRIBE_URL}}}", `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/dashboard/preferences`), idempotencyKey: `campaign-test-${id}-${recipient}` });
  await snapshot.ref.set({ lastTestRecipient: recipient, lastTestSentAt: FieldValue.serverTimestamp() }, { merge: true });
  await auditMarketingAction(admin.uid, "marketing_test_sent", id, { recipientDomain: recipient.split("@")[1] || null });
  revalidatePath("/admin/email-marketing/campaigns");
}
