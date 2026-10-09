export type TimestampCursor = { millis: number; id: string };

export function encodeTimestampCursor(cursor: TimestampCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeTimestampCursor(value: string | undefined): TimestampCursor | null {
  if (!value || value.length > 500) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<TimestampCursor>;
    if (!Number.isSafeInteger(parsed.millis) || Number(parsed.millis) < 0 || typeof parsed.id !== "string" || !/^[A-Za-z0-9_-]{8,160}$/.test(parsed.id)) return null;
    return { millis: Number(parsed.millis), id: parsed.id };
  } catch {
    return null;
  }
}
