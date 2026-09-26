import type { SortInput } from "../databaseType/databaseType.type.js";
import {
  type CursorPaginatedResult,
  type CursorPayload,
  createCursorPaginatedResult,
  decodeCursor,
  encodeCursor,
  normalizeLimit,
} from "./pagination.core.js";
import { createInvalidCursorError } from "./pagination.cursorError.js";
import {
  KEYSET_BACKWARD_KEY,
  type KeysetDirection,
  getKeysetDirection,
  reverseKeysetSort,
} from "./pagination.keysetDirection.js";
import { keysetStrictFilter, keysetTieFilter } from "./pagination.keysetValue.js";

/**
 * Options for building a keyset page.
 */
export interface KeysetPageOptions<TField extends string = string> {
  /**
   * The sort definition the rows were fetched with. The cursor is derived
   * from these fields, in order.
   */
  readonly sort: readonly SortInput<TField>[];
  /**
   * The requested page size. Rows beyond this size indicate a next page.
   */
  readonly limit: number;
  /**
   * The cursor the page was requested with, if any.
   */
  readonly cursor?: string | null;
  /**
   * Secret used to sign cursors. Strongly recommended for public APIs.
   */
  readonly secret?: string;
  /**
   * Direction the page was fetched in (default `"forward"`). Use
   * `getKeysetDirection` on the decoded cursor. A backward page must be
   * fetched with `keysetFetchSort(sort, "backward")`; its rows are put
   * back into `sort` order here.
   */
  readonly direction?: KeysetDirection;
}

/**
 * A Prisma-style filter object produced by the keyset helpers.
 */
export type KeysetWhere = Readonly<Record<string, unknown>>;

/**
 * Decodes and validates a keyset cursor against the sort definition.
 *
 * The payload may only contain the sort fields and primitive values (plus
 * the backward marker of a `previousCursor`). A forged, tampered or
 * malformed cursor throws a `ValidationError` (HTTP 400).
 */
export function decodeKeysetCursor<TField extends string = string>(
  cursor: string,
  sort: readonly SortInput<TField>[],
  secret?: string,
): CursorPayload {
  validateSort(sort);

  const payload = decodeCursor<CursorPayload>(cursor, {
    secret,
    allowedFields: [...sort.map((entry) => entry.field), KEYSET_BACKWARD_KEY],
  });

  for (const entry of sort) {
    if (!Object.hasOwn(payload, entry.field)) {
      throw createInvalidCursorError(
        `Pagination cursor is missing sort field "${entry.field}".`,
        "cursor_field",
      );
    }
  }

  const marker = payload[KEYSET_BACKWARD_KEY];
  if (marker !== undefined && marker !== true) {
    throw createInvalidCursorError(
      "Pagination cursor fields must be primitive values.",
      "cursor_payload",
    );
  }

  return payload;
}

/**
 * Builds a Prisma-compatible `where` fragment that selects the rows that
 * come strictly after the cursor position in the given sort order, or
 * strictly before it for a backward cursor (a `previousCursor`).
 *
 * For a sort of `[a asc, b desc]` the forward result is
 * `OR: [{ a: { gt: A } }, { AND: [{ a: A }, { b: { lt: B } }] }]`.
 *
 * A value encoded from a `Date` is compared as its millisecond bucket
 * (`gte C, lt C + 1ms` for a tie; `lt C` / `gte C + 1ms` for the strict
 * part), so rows created in the same millisecond as the cursor row on a
 * microsecond-precision column fall through to the next sort field
 * instead of being skipped. See `pagination.keysetValue.ts`.
 */
export function buildKeysetWhere<TField extends string = string>(
  cursor: CursorPayload,
  sort: readonly SortInput<TField>[],
): KeysetWhere {
  validateSort(sort);

  const branches: Record<string, unknown>[] = [];

  const effective =
    getKeysetDirection(cursor) === "backward" ? reverseKeysetSort(sort) : sort;

  effective.forEach((entry, index) => {
    const comparison = entry.direction === "desc" ? "lt" : "gt";

    const conditions: Record<string, unknown>[] = effective
      .slice(0, index)
      .map((previous) => ({
        [previous.field]: keysetTieFilter(cursor[previous.field]),
      }));

    conditions.push({
      [entry.field]: keysetStrictFilter(cursor[entry.field], comparison),
    });

    branches.push(
      conditions.length === 1 ? conditions[0]! : { AND: conditions },
    );
  });

  return branches.length === 1 ? branches[0]! : { OR: branches };
}

/**
 * Derives the cursor payload for a row from the sort fields. A
 * `"backward"` cursor selects the rows before `row` instead of after it.
 *
 * `sort` must be the exact sort the page is fetched and decoded with.
 * `BaseRepository#paginateCursor` appends the id field as a tiebreaker, so
 * a cursor for a repository page must include it: use
 * `repository.createCursor(row, { sort })`, which does, rather than this
 * helper with the bare sort.
 */
export function createKeysetCursor<TField extends string = string>(
  row: Readonly<Record<string, unknown>>,
  sort: readonly SortInput<TField>[],
  secret?: string,
  direction: KeysetDirection = "forward",
): string {
  validateSort(sort);

  const payload: Record<string, string | number | boolean | null> = {};

  for (const entry of sort) {
    payload[entry.field] = toCursorValue(row[entry.field], entry.field);
  }

  if (direction === "backward") {
    payload[KEYSET_BACKWARD_KEY] = true;
  }

  return encodeCursor(payload, { secret });
}

/**
 * Turns `limit + 1` fetched rows into a cursor-paginated result.
 *
 * Fetch `limit + 1` rows ordered by `keysetFetchSort(sort, direction)`,
 * then pass them here: the extra row signals another page in the fetch
 * direction and is dropped. `nextCursor` is derived from the last returned
 * row and `previousCursor` from the first, so a client can page both ways.
 *
 * Forward: `previousCursor` is set whenever the page was requested with a
 * cursor and is not empty. Backward: `nextCursor` is always set for a
 * non-empty page, and `previousCursor` only when more rows precede it.
 */
export function createKeysetPage<
  TEntity extends Readonly<Record<string, unknown>>,
  TField extends string = string,
>(
  rows: readonly TEntity[],
  options: KeysetPageOptions<TField>,
): CursorPaginatedResult<TEntity> {
  const limit = normalizeLimit(options.limit);

  const backward = options.direction === "backward";

  const hasMore = rows.length > limit;

  const page = rows.slice(0, limit);

  const data = backward ? page.reverse() : page;

  const first = data[0];

  const last = data[data.length - 1];

  const hasCursor = options.cursor !== undefined && options.cursor !== null;

  const hasNextPage = backward ? hasCursor : hasMore;

  const hasPreviousPage = backward ? hasMore : hasCursor;

  return createCursorPaginatedResult(data, limit, {
    hasNextPage,
    hasPreviousPage,
    nextCursor:
      hasNextPage && last
        ? createKeysetCursor(last, options.sort, options.secret)
        : null,
    previousCursor:
      hasPreviousPage && first
        ? createKeysetCursor(first, options.sort, options.secret, "backward")
        : null,
  });
}

function toCursorValue(
  value: unknown,
  field: string,
): string | number | boolean | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  throw new TypeError(
    `Cannot build a cursor from field "${field}": unsupported value type.`,
  );
}

function validateSort(sort: readonly SortInput<string>[]): void {
  if (!Array.isArray(sort) || sort.length === 0) {
    throw new TypeError("Keyset pagination requires at least one sort field.");
  }

  const seen = new Set<string>();

  for (const entry of sort) {
    if (typeof entry.field !== "string" || entry.field.trim().length === 0) {
      throw new TypeError("Keyset sort fields must be non-empty strings.");
    }

    if (entry.direction !== "asc" && entry.direction !== "desc") {
      throw new TypeError(
        `Keyset sort field "${entry.field}" has an invalid direction.`,
      );
    }

    if (seen.has(entry.field)) {
      throw new TypeError(`Keyset sort field "${entry.field}" is duplicated.`);
    }

    seen.add(entry.field);
  }
}
