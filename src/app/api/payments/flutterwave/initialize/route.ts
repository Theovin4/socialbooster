import { randomUUID } from "node:crypto";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { currentUser } from "@/lib/firebase/session";
import { decimalToMinor } from "@/lib/money";

const schema = z.object({ amount: z.string().regex(/^\d+(\.\d{1,2})?$/), currency: z.literal("NGN") });

export async function POST(request: Request) {
  if (process.env.PAYMENTS_ENABLED !== "true") return Response.json({ error: "Payments are not enabled" }, { status: 503 });
  const user = await currentUser(true);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const input = schema.parse(await request.json()), reference = `flw_${randomUUID()}`, amountMinor = Number(decimalToMinor(input.amount)), app = process.env.NEXT_PUBLIC_APP_URL || "https://socialbooster-sigma.vercel.app";
  if (amountMinor < 10_000 || amountMinor > 500_000_000) throw new Error("Funding amount is outside permitted limits");
  await adminDb().collection("paymentIntents").doc(reference).create({ userId: user.uid, provider: "flutterwave", amountMinor, currency: "NGN", status: "pending", createdAt: new Date() });
  const response = await fetch("https://api.flutterwave.com/v3/payments", { method: "POST", headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ tx_ref: reference, amount: input.amount, currency: "NGN", redirect_url: `${app}/api/payments/flutterwave/callback`, customer: { email: user.email || "customer@invalid.local", name: typeof user.name === "string" ? user.name : undefined }, customizations: { title: "Social Booster", description: "Secure Social Booster wallet funding", logo: `${app}/icon-512.png` } }), cache: "no-store" });
  if (!response.ok) return Response.json({ error: "Could not initialize Flutterwave" }, { status: 502 });
  const data = z.object({ data: z.object({ link: z.string().url() }) }).parse(await response.json());
  return Response.json({ url: data.data.link });
}
