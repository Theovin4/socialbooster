import { createHash, randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase/admin";

const KEY_PATTERN = /^sb_live_[A-Za-z0-9_-]{43}$/;
const RATE_LIMIT = 120;

export class CustomerApiError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}

export function hashCustomerApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function generateCustomerApiKey() {
  return `sb_live_${randomBytes(32).toString("base64url")}`;
}

export async function authenticateCustomerApi(request: Request, bodyKey?: unknown) {
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const key = bearer || (typeof bodyKey === "string" ? bodyKey.trim() : "");
  if (!KEY_PATTERN.test(key)) throw new CustomerApiError("Invalid API key", 401, "invalid_key");
  const hash = hashCustomerApiKey(key), ref = adminDb().collection("customerApiKeys").doc(hash);
  const now = Date.now(), windowStart = Math.floor(now / 60_000) * 60_000;
  const record = await adminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.get("status") !== "active") throw new CustomerApiError("Invalid API key", 401, "invalid_key");
    const sameWindow = Number(snapshot.get("rateWindowStart") || 0) === windowStart;
    const requestCount = sameWindow ? Number(snapshot.get("rateWindowCount") || 0) : 0;
    if (requestCount >= RATE_LIMIT) throw new CustomerApiError("Rate limit exceeded", 429, "rate_limited");
    transaction.update(ref, { rateWindowStart: windowStart, rateWindowCount: requestCount + 1, lastUsedAt: FieldValue.serverTimestamp() });
    return { userId: String(snapshot.get("userId")), keyHash: hash };
  });
  return record;
}
