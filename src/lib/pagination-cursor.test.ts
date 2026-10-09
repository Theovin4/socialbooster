import { describe, expect, it } from "vitest";
import { decodeTimestampCursor, encodeTimestampCursor } from "./pagination-cursor";

describe("timestamp pagination cursor", () => {
  it("round-trips a valid cursor", () => {
    const cursor = { millis: 1_728_000_000_000, id: "order_12345678" };
    expect(decodeTimestampCursor(encodeTimestampCursor(cursor))).toEqual(cursor);
  });

  it("rejects malformed and oversized cursors", () => {
    expect(decodeTimestampCursor("not-base64-json")).toBeNull();
    expect(decodeTimestampCursor("x".repeat(501))).toBeNull();
  });
});
