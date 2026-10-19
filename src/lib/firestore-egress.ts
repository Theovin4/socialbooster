export type PayloadSummary = {
  documentCount: number;
  totalBytes: number;
  averageBytes: number;
  largestBytes: number;
};

/**
 * Conservative application-level estimate of values returned by Firestore.
 * This is not a billing byte counter: protobuf framing, document names and
 * transport compression can make the billed value differ.
 */
export function approximateFirestoreValueBytes(value: unknown, seen = new Set<object>()): number {
  if (value === null || value === undefined) return 1;
  if (typeof value === "string") return Buffer.byteLength(value, "utf8") + 1;
  if (typeof value === "number" || typeof value === "bigint") return 8;
  if (typeof value === "boolean") return 1;
  if (value instanceof Date) return 8;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return value.byteLength;
  if (typeof value !== "object") return Buffer.byteLength(String(value), "utf8");
  if (seen.has(value)) return 0;
  seen.add(value);
  const firestoreValue = value as { toDate?: () => Date; toUint8Array?: () => Uint8Array };
  if (typeof firestoreValue.toUint8Array === "function") return firestoreValue.toUint8Array().byteLength;
  if (typeof firestoreValue.toDate === "function") return 8;
  if (Array.isArray(value)) return value.reduce((total, item) => total + approximateFirestoreValueBytes(item, seen) + 1, 2);
  return Object.entries(value as Record<string, unknown>).reduce(
    (total, [key, item]) => total + Buffer.byteLength(key, "utf8") + approximateFirestoreValueBytes(item, seen) + 2,
    2,
  );
}

export function summarizePayloadBytes(values: unknown[]): PayloadSummary {
  const sizes = values.map((value) => approximateFirestoreValueBytes(value));
  const totalBytes = sizes.reduce((sum, value) => sum + value, 0);
  return {
    documentCount: sizes.length,
    totalBytes,
    averageBytes: sizes.length ? Math.round(totalBytes / sizes.length) : 0,
    largestBytes: sizes.length ? Math.max(...sizes) : 0,
  };
}

