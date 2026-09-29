import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { ensureApplicationUser } from "@/lib/firebase/application-user";
import { SESSION_COOKIE } from "@/lib/firebase/session";
import { brandedEmail, sendAdminAlert, sendBrandedEmail } from "@/lib/email";

const bodySchema = z.object({ idToken: z.string().min(100) });
const MAX_AGE = 60 * 60 * 24 * 5;

function normalizedHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function trustedOrigin(origin: string | null) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const app = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://socialbooster.net.ng");
    const host = normalizedHost(url.hostname);
    const allowed = new Set([normalizedHost(app.hostname), "socialbooster.net.ng"]);
    return (url.protocol === "https:" && allowed.has(host)) || url.hostname === "localhost";
  } catch {
    return false;
  }
}

async function claimNotificationEvent(id: string, type: string, userId: string) {
  const event = adminDb().collection("adminNotificationEvents").doc(id);
  const created = await event.create({ type, userId, status: "pending", createdAt: FieldValue.serverTimestamp() }).then(() => true).catch(() => false);
  return created ? event : null;
}

async function notifyNewSignup(uid: string, email?: string, name?: string) {
  const event = await claimNotificationEvent(`signup_${uid}`, "signup", uid);
  if (!event) return;
  try {
    await sendAdminAlert({
      subject: "New Social Booster customer",
      title: "New customer signup",
      message: `${name || "A new customer"} created an account${email ? ` using ${email}` : ""}.`,
      buttonLabel: "Open administration",
      buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng"}/admin`,
    });
    await event.set({ status: "sent", sentAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (error) {
    await event.set({ status: "failed", error: error instanceof Error ? error.message : "Unknown error", updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => undefined);
  }
}

async function notifyGoogleCustomer(token: DecodedIdToken) {
  if (!token.email) return;
  const event = await claimNotificationEvent(`google_welcome_${token.uid}`, "google_welcome", token.uid);
  if (!event) return;
  try {
    const app = process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng";
    const delivery = await sendBrandedEmail({
      to: token.email,
      subject: "Your Social Booster account is ready",
      idempotencyKey: `google-welcome-${token.uid}`,
      html: brandedEmail({
        title: `Welcome${token.name ? `, ${token.name.split(" ")[0]}` : ""}`,
        preview: "Your Social Booster account is ready",
        message: "Your Google account is securely connected. You can now fund your wallet, choose a service and track every order from your dashboard.",
        buttonLabel: "Open dashboard",
        buttonUrl: `${app}/dashboard`,
      }),
    });
    await event.set({ status: "sent", emailId: delivery.id, sentAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (error) {
    await event.set({ status: "failed", error: error instanceof Error ? error.message : "Unknown error", updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => undefined);
  }
}

async function completePostLogin(token: DecodedIdToken) {
  try {
    const account = await ensureApplicationUser(token);
    if (!account.created) return;
    const tasks: Promise<unknown>[] = [notifyNewSignup(token.uid, token.email, token.name)];
    if (token.firebase?.sign_in_provider === "google.com") tasks.push(notifyGoogleCustomer(token));
    const results = await Promise.allSettled(tasks);
    for (const result of results) if (result.status === "rejected") console.error("[auth:session] post-login notification failed", { userId: token.uid, error: result.reason instanceof Error ? result.reason.message : "Unknown error" });
  } catch (error) {
    console.error("[auth:session] post-login bootstrap failed", { userId: token.uid, error: error instanceof Error ? error.message : "Unknown error" });
  }
}

export async function POST(request: Request) {
  if (!trustedOrigin((await headers()).get("origin"))) return Response.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const { idToken } = bodySchema.parse(await request.json());
    const decoded = await adminAuth().verifyIdToken(idToken, true);
    if (Date.now() / 1000 - decoded.auth_time > 300) return Response.json({ error: "Recent sign-in required" }, { status: 401 });
    const session = await adminAuth().createSessionCookie(idToken, { expiresIn: MAX_AGE * 1000 });
    (await cookies()).set(SESSION_COOKIE, session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
    after(() => completePostLogin(decoded));
    return Response.json({ ok: true, admin: decoded.admin === true, emailVerified: decoded.email_verified === true });
  } catch (error) {
    console.error("[auth:session] session creation failed", { error: error instanceof Error ? error.message : "Unknown error" });
    return Response.json({ error: "Authentication failed" }, { status: 401 });
  }
}

export async function DELETE() {
  (await cookies()).set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return Response.json({ ok: true });
}
