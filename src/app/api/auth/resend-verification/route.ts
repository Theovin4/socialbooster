import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { brandedEmail, sendBrandedEmail } from "@/lib/email";

export async function POST() {
  const session = await requireUser();
  try {
    const account = await adminAuth().getUser(session.uid);
    if (account.emailVerified || !account.email) return Response.json({ ok: true, verified: account.emailVerified });
    const ref = adminDb().collection("verificationEmailRateLimits").doc(session.uid), snapshot = await ref.get(), lastSent = snapshot.get("lastSentAt")?.toMillis?.() || 0;
    if (Date.now() - lastSent < 60_000) return Response.json({ ok: true, rateLimited: true });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng";
    const link = await adminAuth().generateEmailVerificationLink(account.email, { url: `${appUrl}/dashboard`, handleCodeInApp: false });
    const delivery = await sendBrandedEmail({ to: account.email, subject: "Verify your Social Booster email", idempotencyKey: `verification-resend-${session.uid}-${Math.floor(Date.now() / 60_000)}`, html: brandedEmail({ title: "Verify your email", preview: "Secure your Social Booster account", message: "Your account is already active. Confirm this email address to secure account recovery and receive important service updates.", buttonLabel: "Verify email", buttonUrl: link }) });
    await Promise.all([
      ref.set({ lastSentAt: FieldValue.serverTimestamp() }, { merge: true }),
      adminDb().collection("emailDeliveries").doc(delivery.id).set({ userId: session.uid, recipientHash: createHash("sha256").update(account.email.toLowerCase()).digest("hex"), type: "verification", status: "accepted", createdAt: FieldValue.serverTimestamp() }),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[verification-resend] failed", { userId: session.uid, error: error instanceof Error ? error.message : "Unknown error" });
    return Response.json({ error: "Verification email could not be sent" }, { status: 502 });
  }
}
