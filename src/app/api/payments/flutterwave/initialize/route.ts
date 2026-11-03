import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { currentUser } from "@/lib/firebase/session";
import { decimalToMinor } from "@/lib/money";
import { flutterwaveReferenceForRequest, isAlreadyExistsError } from "@/lib/payments/checkout";
import { registerSocialBoosterIntent } from "@/lib/payments/gateway";

const schema = z.object({ amount: z.string().regex(/^\d+(\.\d{1,2})?$/), currency: z.literal("NGN"), requestId: z.string().uuid() });

export async function POST(request: Request) {
  if (process.env.PAYMENTS_ENABLED !== "true") return Response.json({ error: "Payments are not enabled" }, { status: 503 });
  const user = await currentUser(true);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const input = schema.parse(await request.json()), reference = flutterwaveReferenceForRequest(user.uid, input.requestId), amountMinor = Number(decimalToMinor(input.amount)), app = process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng";
  if (amountMinor < 10_000 || amountMinor > 500_000_000) throw new Error("Funding amount is outside permitted limits");
  const db = adminDb(), intentRef = db.collection("paymentIntents").doc(reference);
  try {
    await intentRef.create({ userId: user.uid, provider: "flutterwave", amountMinor, currency: "NGN", status: "initializing", checkoutRequestId: input.requestId, createdAt: new Date(), updatedAt: new Date() });
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
    const existing = await intentRef.get();
    if (!existing.exists || existing.get("userId") !== user.uid || Number(existing.get("amountMinor")) !== amountMinor || existing.get("currency") !== "NGN") return Response.json({ error: "Checkout request conflicts with an earlier attempt" }, { status: 409 });
    const existingUrl = existing.get("checkoutUrl");
    if (typeof existingUrl === "string" && existingUrl.startsWith("https://")) return Response.json({ url: existingUrl, duplicate: true });
    return Response.json({ error: "Checkout is already being prepared. Please wait before retrying." }, { status: 409 });
  }

  try {
    const gateway = await registerSocialBoosterIntent({ txRef: reference, amountMinor, currency: "NGN" });
    if (gateway.mode === "shadow" && !gateway.registered) console.warn("[flutterwave:gateway] shadow intent registration failed", { reference });
    const secret = process.env.FLUTTERWAVE_SECRET_KEY;
    if (!secret) throw new Error("flutterwave_not_configured");
    const response = await fetch("https://api.flutterwave.com/v3/payments", { method: "POST", headers: { Authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify({ tx_ref: reference, amount: input.amount, currency: "NGN", redirect_url: `${app}/api/payments/flutterwave/callback`, customer: { email: user.email || "customer@invalid.local", name: typeof user.name === "string" ? user.name : undefined }, customizations: { title: "Social Booster", description: "Secure Social Booster wallet funding", logo: `${app}/icon-512.png` } }), cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`flutterwave_initialize_http_${response.status}`);
    const data = z.object({ data: z.object({ link: z.string().url() }) }).parse(await response.json());
    await intentRef.set({ status: "pending", checkoutUrl: data.data.link, gatewayMode: gateway.mode, gatewayRegistered: gateway.registered, checkoutCreatedAt: new Date(), updatedAt: new Date() }, { merge: true });
    return Response.json({ url: data.data.link });
  } catch (error) {
    const code = error instanceof Error && /^[a-z0-9_]+$/i.test(error.message) ? error.message.slice(0, 120) : "checkout_initialization_failed";
    await intentRef.set({ status: "initialization_failed", initializationErrorCode: code, updatedAt: new Date() }, { merge: true }).catch(() => undefined);
    return Response.json({ error: "Could not initialize Flutterwave. No wallet credit was created; please try again." }, { status: 502 });
  }
}
