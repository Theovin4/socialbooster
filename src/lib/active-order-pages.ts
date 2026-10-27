export type ActiveOrderCursor = { createdAtMs: number; id: string };

export type ActiveOrderPage<T> = {
  documents: T[];
};

export function compareActiveOrderCursors(left: ActiveOrderCursor, right: ActiveOrderCursor) {
  return left.createdAtMs === right.createdAtMs
    ? left.id.localeCompare(right.id)
    : left.createdAtMs - right.createdAtMs;
}

export function prioritizeNeverChecked<T>(documents: T[], lastCheckedAt: (document: T) => number | null) {
  return [...documents].sort((left, right) => {
    const leftChecked = lastCheckedAt(left) !== null;
    const rightChecked = lastCheckedAt(right) !== null;
    return Number(leftChecked) - Number(rightChecked);
  });
}

export function boundedBatches<T>(values: T[], maximum = 100) {
  if (!Number.isSafeInteger(maximum) || maximum <= 0 || maximum > 100) throw new Error("Invalid provider batch maximum");
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += maximum) result.push(values.slice(offset, offset + maximum));
  return result;
}

/**
 * Collects a bounded, deterministic sweep. When a previous cursor exists the
 * scan wraps once, so queues larger than one run rotate fairly without ever
 * repeating a document inside the same run.
 */
export async function collectActiveOrderPages<T>(input: {
  fetchPage: (after: ActiveOrderCursor | null, limit: number) => Promise<ActiveOrderPage<T>>;
  cursorFor: (document: T) => ActiveOrderCursor;
  initialCursor?: ActiveOrderCursor | null;
  maxDocuments: number;
  pageSize: number;
}) {
  if (!Number.isSafeInteger(input.maxDocuments) || input.maxDocuments <= 0) throw new Error("Invalid active-order sweep maximum");
  if (!Number.isSafeInteger(input.pageSize) || input.pageSize <= 0 || input.pageSize > 100) throw new Error("Invalid active-order page size");

  const initialCursor = input.initialCursor || null;
  const documents: T[] = [];
  const seen = new Set<string>();
  let after = initialCursor;
  let wrapped = initialCursor === null;
  let pagesRead = 0;
  let nextCursor = initialCursor;
  let reachedOrigin = false;

  while (documents.length < input.maxDocuments && !reachedOrigin) {
    const limit = Math.min(input.pageSize, input.maxDocuments - documents.length);
    const page = await input.fetchPage(after, limit);
    pagesRead += 1;

    if (!page.documents.length) {
      if (!wrapped && initialCursor) {
        after = null;
        wrapped = true;
        continue;
      }
      break;
    }

    for (const document of page.documents) {
      const cursor = input.cursorFor(document);
      if (wrapped && initialCursor && compareActiveOrderCursors(cursor, initialCursor) > 0) {
        reachedOrigin = true;
        break;
      }
      const identity = `${cursor.createdAtMs}:${cursor.id}`;
      if (!seen.has(identity)) {
        seen.add(identity);
        documents.push(document);
        nextCursor = cursor;
      }
      after = cursor;
      if (documents.length >= input.maxDocuments) break;
    }

    if (reachedOrigin || documents.length >= input.maxDocuments) break;
    if (page.documents.length < limit) {
      if (!wrapped && initialCursor) {
        after = null;
        wrapped = true;
      } else {
        break;
      }
    }
  }

  return { documents, pagesRead, nextCursor };
}
