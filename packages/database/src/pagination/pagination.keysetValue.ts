/**
 * Cursor value comparisons for keyset pagination.
 *
 * A `Date` is encoded into a cursor as its ISO string, which carries
 * millisecond precision. PostgreSQL `timestamp`/`timestamptz` columns keep
 * microseconds unless declared with precision `(3)`, and Prisma hands rows
 * back as JavaScript `Date`s, so the exact stored value is not available
 * to the cursor. Comparing `field = C` against such a column matched
 * nothing and `field < C` skipped every row created in the same
 * millisecond as the cursor row.
 *
 * A date cursor value is therefore compared as its millisecond bucket
 * `[C, C + 1ms)`: rows outside the bucket are ordered by the strict
 * comparison, and rows inside it fall through to the next sort field (the
 * id tiebreaker `paginateCursor` appends). On millisecond-precision
 * columns this is exactly the old `=`/`<`/`>` comparison.
 */

/** Exactly the shape `Date.prototype.toISOString` emits. */
const ISO_MILLISECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Whether a cursor value was encoded from a `Date` by `createKeysetCursor`.
 */
export function isDateCursorValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_MILLISECOND_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

/**
 * The ISO string one millisecond after a date cursor value: the exclusive
 * upper bound of its millisecond bucket.
 */
export function nextMillisecond(value: string): string {
  return new Date(Date.parse(value) + 1).toISOString();
}

/**
 * The Prisma filter selecting rows that tie with a cursor value on a sort
 * field: `{ equals }` for ordinary values, the millisecond bucket for dates.
 */
export function keysetTieFilter(value: unknown): Readonly<Record<string, unknown>> {
  if (isDateCursorValue(value)) {
    return { gte: value, lt: nextMillisecond(value) };
  }

  return { equals: value };
}

/**
 * The Prisma filter selecting rows strictly after (`"gt"`) or before
 * (`"lt"`) a cursor value on a sort field. For a date the boundary is the
 * whole millisecond bucket: `lt C` below it, `gte C + 1ms` above it.
 */
export function keysetStrictFilter(
  value: unknown,
  comparison: "gt" | "lt",
): Readonly<Record<string, unknown>> {
  if (isDateCursorValue(value) && comparison === "gt") {
    return { gte: nextMillisecond(value) };
  }

  return { [comparison]: value };
}
