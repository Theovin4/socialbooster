import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "./firebase/admin";
import { brandedEmail, sendAdminAlert, sendBrandedEmail } from "./email";
import { brandedVerificationLink } from "./firebase/verification-link";

const THREE_WEEKS_MS = 21 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;

export async function sendRecentActivationEmails() {
  const cutoff = Date.now() - THREE_WEEKS_MS, appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng";
  const users: Array<{ uid: string; email: string }> = [];
  let pageToken: string | undefined;
  do {
    const page = await adminAuth().listUsers(1000, pageToken);
    for (const user of page.users) {
      const createdAt = Date.parse(user.metadata.creationTime);
      if (!user.disabled && !user.emailVerified && user.email && createdAt >= cutoff) users.push({ uid: user.uid, email: user.email });
    }
    pageToken = page.pageToken;
  } while (pageToken && users.length < 5000);

  let sent = 0, skipped = 0, failed = 0, deferred = 0;
  const batch = users.slice(0, BATCH_SIZE);
  for (let index = 0; index < batch.length; index += 10) {
    await Promise.all(batch.slice(index, index + 10).map(async (user) => {
      const campaignRef = adminDb().collection("activationCampaigns").doc(`recent_${user.uid}`);
      try {
        const previous = await campaignRef.get();
        if (previous.exists && previous.get("status") === "sent") { skipped += 1; return; }
        const attempts = Number(previous.get("attemptCount") || 0);
        if (previous.get("status") === "terminal_failure" || attempts >= MAX_ATTEMPTS) { skipped += 1; return; }
        const nextAttemptAt = previous.get("nextAttemptAt")?.toMillis?.() || 0;
        if (nextAttemptAt > Date.now()) { deferred += 1; return; }
        const firebaseLink = await adminAuth().generateEmailVerificationLink(user.email);
        const link = brandedVerificationLink(firebaseLink, appUrl);
        const delivery = await sendBrandedEmail({ to: user.email, subject: "Confirm your Social Booster email", idempotencyKey: `recent-activation-${user.uid}-${attempts + 1}`, html: brandedEmail({ title: "Confirm your email", preview: "Secure your active Social Booster account", message: "Your Social Booster account is active and ready to use. Confirm your email address to secure account recovery and receive important service updates.", buttonLabel: "Confirm email", buttonUrl: link }) });
        await campaignRef.set({ userId: user.uid, emailId: delivery.id, status: "sent", attemptCount: attempts + 1, lastAttemptAt: FieldValue.serverTimestamp(), lastErrorCategory: FieldValue.delete(), nextAttemptAt: FieldValue.delete(), sentAt: FieldValue.serverTimestamp() }, { merge: true });
        sent += 1;
      } catch (error) {
        failed += 1;
        console.error("[activation-campaign] customer delivery failed", { userId: user.uid, error: error instanceof Error ? error.message : "Unknown error" });
        const previous = await campaignRef.get().catch(() => null), attempts = Number(previous?.get("attemptCount") || 0) + 1;
        const message = error instanceof Error ? error.message : "Unknown error";
        const category = /invalid|not found|recipient/i.test(message) ? "permanent_recipient_error" : /rate|429/i.test(message) ? "rate_limited" : "temporary_delivery_error";
        const terminal = attempts >= MAX_ATTEMPTS || category === "permanent_recipient_error";
        const backoffMs = Math.min(24 * 60 * 60 * 1000, 15 * 60 * 1000 * 2 ** Math.max(0, attempts - 1));
        await campaignRef.set({ userId: user.uid, status: terminal ? "terminal_failure" : "retry_scheduled", attemptCount: attempts, lastAttemptAt: FieldValue.serverTimestamp(), nextAttemptAt: terminal ? FieldValue.delete() : new Date(Date.now() + backoffMs), lastErrorCategory: category, error: message.slice(0, 300), updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => undefined);
      }
    }));
  }
  await sendAdminAlert({ subject: "Activation email recovery completed", title: "Account email recovery report", message: `${sent} activation email(s) sent, ${skipped} already handled, ${deferred} waiting for retry and ${failed} failed in this bounded run.`, buttonLabel: "Open administration", buttonUrl: `${appUrl}/admin` }).catch(() => undefined);
  return { eligible: users.length, processed: batch.length, sent, skipped, deferred, failed };
}
