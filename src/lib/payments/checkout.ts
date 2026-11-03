import { createHash } from "node:crypto";

export function flutterwaveReferenceForRequest(userId: string, requestId: string) {
  if (!userId || userId.length > 128 || !/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("Invalid checkout request identity");
  return `flw_${createHash("sha256").update(`${userId}:${requestId}`).digest("hex").slice(0, 40)}`;
}

export function isAlreadyExistsError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  return code === "6" || code === "already-exists" || code === "ALREADY_EXISTS";
}
