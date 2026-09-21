import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { brandedEmail, sendBrandedEmail } from "@/lib/email";

const schema = z.object({ type: z.enum(["verification", "reset"]), email: z.string().email(), idToken: z.string().optional() });
export async function POST(request: Request) {
  const input = schema.parse(await request.json());
  const app = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const key = createHash("sha256").update(`${input.type}:${input.email.toLowerCase()}`).digest("hex");
  const rateRef = adminDb().collection("emailRateLimits").doc(key), rate = await rateRef.get(), last = rate.get("sentAt")?.toMillis?.() || 0;
  if (Date.now() - last < 60_000) return Response.json({ ok: true });
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return Response.json({ error: "Branded email is not configured" }, { status: 503 });
  try {
    if (input.type === "verification") {
      if (!input.idToken) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const token = await adminAuth().verifyIdToken(input.idToken, true);
      if (token.email?.toLowerCase() !== input.email.toLowerCase()) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const link = await adminAuth().generateEmailVerificationLink(input.email);
      const delivery = await sendBrandedEmail({ to: input.email, subject: "Verify your Social Booster email", html: brandedEmail({ title: "Confirm your email address", preview: "Secure your active Social Booster account", message: "Welcome to Social Booster. Your account is ready to use. Confirm this email address to secure account recovery and receive important service updates.", buttonLabel: "Verify my email", buttonUrl: link }), idempotencyKey: `account-verification-${token.uid}-${Math.floor(Date.now() / 60_000)}` });
      await adminDb().collection("emailDeliveries").doc(delivery.id).set({ userId: token.uid, recipientHash: createHash("sha256").update(input.email.toLowerCase()).digest("hex"), type: "verification", status: "accepted", createdAt: FieldValue.serverTimestamp() }).catch((error) => console.warn("[auth-email] delivery audit unavailable", { emailId: delivery.id, error: error instanceof Error ? error.message : "Unknown error" }));
    } else {
      const link = await adminAuth().generatePasswordResetLink(input.email, { url: `${app}/login`, handleCodeInApp: false });
      const delivery = await sendBrandedEmail({ to: input.email, subject: "Reset your Social Booster password", html: brandedEmail({ title: "Reset your password", preview: "Secure password reset request", message: "We received a request to reset your Social Booster password. If you did not request this, you can safely ignore this email.", buttonLabel: "Reset password", buttonUrl: link }), idempotencyKey: `password-reset-${key}-${Math.floor(Date.now() / 60_000)}` });
      await adminDb().collection("emailDeliveries").doc(delivery.id).set({ recipientHash: createHash("sha256").update(input.email.toLowerCase()).digest("hex"), type: "reset", status: "accepted", createdAt: FieldValue.serverTimestamp() }).catch((error) => console.warn("[auth-email] delivery audit unavailable", { emailId: delivery.id, error: error instanceof Error ? error.message : "Unknown error" }));
    }
    await rateRef.set({ sentAt: FieldValue.serverTimestamp(), type: input.type }, { merge: true });
  } catch (error) {
    console.error("[auth-email] request not delivered", { type: input.type, error: error instanceof Error ? error.message : "Unknown error" });
    return Response.json({ error: "Branded email delivery is temporarily unavailable" }, { status: 502 });
  }
  return Response.json({ ok: true });
}
