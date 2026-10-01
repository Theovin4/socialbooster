import { createHash } from "node:crypto";

/** Stable, non-reversible customer-facing identifier with no provider details. */
export function publicServiceId(internalId: string) {
  const digest = createHash("sha256")
    .update(`social-booster-service:${internalId}`)
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();
  return `SB-${digest}`;
}
