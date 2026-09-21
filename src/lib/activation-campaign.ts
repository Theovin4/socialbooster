import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "./firebase/admin";
import { brandedEmail, sendAdminAlert, sendBrandedEmail } from "./email";
import { brandedVerificationLink } from "./firebase/verification-link";

const THREE_WEEKS_MS = 21 * 24 * 60 * 60 * 1000;

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

  let sent = 0, skipped = 0, failed = 0;
  for (let index = 0; index < users.length; index += 10) {
    await Promise.all(users.slice(index, index + 10).map(async (user) => {
      const campaignRef = adminDb().collection("activationCampaigns").doc(`recent_${user.uid}`);
      try {
        const previous = await campaignRef.get();
        if (previous.exists && previous.get("status") === "sent") { skipped += 1; return; }
        const firebaseLink = await adminAuth().generateEmailVerificationLink(user.email);
        const link = brandedVerificationLink(firebaseLink, appUrl);
        const delivery = await sendBrandedEmail({ to: user.email, subject: "Confirm your Social Booster email", idempotencyKey: `recent-activation-${user.uid}`, html: brandedEmail({ title: "Confirm your email", preview: "Secure your active Social Booster account", message: "Your Social Booster account is active and ready to use. Confirm your email address to secure account recovery and receive important service updates.", buttonLabel: "Confirm email", buttonUrl: link }) });
        await campaignRef.set({ userId: user.uid, emailId: delivery.id, status: "sent", sentAt: FieldValue.serverTimestamp() });
        sent += 1;
      } catch (error) {
        failed += 1;
        console.error("[activation-campaign] customer delivery failed", { userId: user.uid, error: error instanceof Error ? error.message : "Unknown error" });
        await campaignRef.set({ userId: user.uid, status: "failed", error: error instanceof Error ? error.message : "Unknown error", updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => undefined);
      }
    }));
  }
  await sendAdminAlert({ subject: "Activation email recovery completed", title: "Account email recovery report", message: `${sent} activation email(s) sent, ${skipped} already handled and ${failed} failed for accounts created during the last three weeks.`, buttonLabel: "Open administration", buttonUrl: `${appUrl}/admin` }).catch(() => undefined);
  return { eligible: users.length, sent, skipped, failed };
}
