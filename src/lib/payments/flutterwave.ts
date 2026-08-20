import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const verifiedSchema = z.object({ status: z.string(), data: z.object({ id: z.coerce.number().int().positive(), status: z.string(), amount: z.coerce.number().positive(), currency: z.string(), tx_ref: z.string(), customer: z.object({ email: z.string().email().optional() }).optional() }) });
export function verifyFlutterwaveSignature(rawBody: string, signature: string | null, secret = process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH || "") {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
export function verifyFlutterwaveLegacyHash(hash: string | null, secret = process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH || "") {
  if (!secret || !hash) return false;
  const expected = Buffer.from(secret);
  const received = Buffer.from(hash);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
export async function verifyFlutterwaveTransaction(id: number) {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) throw new Error("Flutterwave is not configured");
  const response = await fetch(`https://api.flutterwave.com/v3/transactions/${id}/verify`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`Flutterwave verification failed: ${response.status}`);
  return verifiedSchema.parse(await response.json()).data;
}
