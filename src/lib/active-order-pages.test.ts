import { describe, expect, it } from "vitest";
import { boundedBatches, collectActiveOrderPages, prioritizeNeverChecked, type ActiveOrderCursor } from "./active-order-pages";

type Row = { id: string; createdAtMs: number };
const cursorFor = (row: Row): ActiveOrderCursor => ({ createdAtMs: row.createdAtMs, id: row.id });
const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `order-${String(index + 1).padStart(3, "0")}`, createdAtMs: index + 1 }));

function fetcher(source: Row[], calls: Array<{ after: ActiveOrderCursor | null; limit: number }>) {
  return async (after: ActiveOrderCursor | null, limit: number) => {
    calls.push({ after, limit });
    const start = after ? source.findIndex((row) => row.id === after.id) + 1 : 0;
    return { documents: source.slice(Math.max(0, start), Math.max(0, start) + limit) };
  };
}

describe("fair active-order pagination", () => {
  it("reaches all 272 active orders through 100-document pages", async () => {
    const source = rows(272), calls: Array<{ after: ActiveOrderCursor | null; limit: number }> = [];
    const result = await collectActiveOrderPages({ fetchPage: fetcher(source, calls), cursorFor, maxDocuments: 500, pageSize: 100 });
    expect(result.documents).toHaveLength(272);
    expect(result.documents[100].id).toBe("order-101");
    expect(calls.map((call) => call.limit)).toEqual([100, 100, 100]);
  });

  it("does not repeat documents across pages", async () => {
    const source = rows(272), calls: Array<{ after: ActiveOrderCursor | null; limit: number }> = [];
    const result = await collectActiveOrderPages({ fetchPage: fetcher(source, calls), cursorFor, maxDocuments: 500, pageSize: 100 });
    expect(new Set(result.documents.map((row) => row.id)).size).toBe(272);
  });

  it("wraps from a stored cursor and still visits a bounded queue exactly once", async () => {
    const source = rows(272), calls: Array<{ after: ActiveOrderCursor | null; limit: number }> = [];
    const result = await collectActiveOrderPages({ fetchPage: fetcher(source, calls), cursorFor, initialCursor: cursorFor(source[149]), maxDocuments: 500, pageSize: 100 });
    expect(result.documents).toHaveLength(272);
    expect(result.documents[0].id).toBe("order-151");
    expect(result.documents.at(-1)?.id).toBe("order-150");
    expect(new Set(result.documents.map((row) => row.id)).size).toBe(272);
  });

  it("advances fairly across queues larger than the per-run maximum", async () => {
    const source = rows(720), firstCalls: Array<{ after: ActiveOrderCursor | null; limit: number }> = [];
    const first = await collectActiveOrderPages({ fetchPage: fetcher(source, firstCalls), cursorFor, maxDocuments: 500, pageSize: 100 });
    const secondCalls: Array<{ after: ActiveOrderCursor | null; limit: number }> = [];
    const second = await collectActiveOrderPages({ fetchPage: fetcher(source, secondCalls), cursorFor, initialCursor: first.nextCursor, maxDocuments: 500, pageSize: 100 });
    expect(first.documents.at(-1)?.id).toBe("order-500");
    expect(second.documents[0].id).toBe("order-501");
    expect(second.documents.some((row) => row.id === "order-001")).toBe(true);
  });
});

describe("active-order processing policy", () => {
  it("keeps every provider status request at or below 100 IDs", () => {
    const batches = boundedBatches(rows(272).map((row) => row.id));
    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 72]);
    expect(Math.max(...batches.map((batch) => batch.length))).toBe(100);
  });

  it("processes never-checked orders before previously checked orders", () => {
    const source = [{ id: "checked", checkedAt: 1 }, { id: "never-a", checkedAt: null }, { id: "never-b", checkedAt: null }];
    expect(prioritizeNeverChecked(source, (row) => row.checkedAt).map((row) => row.id)).toEqual(["never-a", "never-b", "checked"]);
  });
});
