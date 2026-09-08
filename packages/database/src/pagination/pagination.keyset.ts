import type { SortInput } from "../databaseType/databaseType.type.js";
import {
  type CursorPaginatedResult,
  type CursorPayload,
  createCursorPaginatedResult,
  decodeCursor,
  encodeCursor,
  normalizeLimit,
} from "./pagination.core.js";

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
}

/**
 * A Prisma-style filter object produced by the keyset helpers.
 */
export type KeysetWhere = Readonly<Record<string, unknown>>;

/**
 * Decodes and validates a keyset cursor against the sort definition.
 *
 * The payload may only contain the sort fields and primitive values.
 */
export function decodeKeysetCursor<TField extends string = string>(
  cursor: string,
  sort: readonly SortInput<TField>[],
  secret?: string,
): CursorPayload {
  validateSort(sort);

  const payload = decodeCursor<CursorPayload>(cursor, {
    secret,
    allowedFields: sort.map((entry) => entry.field),
  });

  for (const entry of sort) {
    if (!(entry.field in payload)) {
      throw new TypeError(
        `Pagination cursor is missing sort field "${entry.field}".`,
      );
    }
  }

  return payload;
}

/**
 * Builds a Prisma-compatible `where` fragment that selects the rows that
 * come strictly after the cursor position in the given sort order.
 *
 * For a sort of `[a asc, b desc]` the result is
 * `OR: [{ a: { gt: A } }, { AND: [{ a: A }, { b: { lt: B } }] }]`.
 */
export function buildKeysetWhere<TField extends string = string>(
  cursor: CursorPayload,
  sort: readonly SortInput<TField>[],
): KeysetWhere {
  validateSort(sort);

  const branches: Record<string, unknown>[] = [];

  sort.forEach((entry, index) => {
    const comparison = entry.direction === "desc" ? "lt" : "gt";

    const conditions: Record<string, unknown>[] = sort
      .slice(0, index)
      .map((previous) => ({
        [previous.field]: { equals: cursor[previous.field] },
      }));

    conditions.push({
      [entry.field]: { [comparison]: cursor[entry.field] },
    });

    branches.push(
      conditions.length === 1 ? conditions[0]! : { AND: conditions },
    );
  });

  return branches.length === 1 ? branches[0]! : { OR: branches };
}

/**
 * Derives the cursor payload for a row from the sort fields.
 */
export function createKeysetCursor<TField extends string = string>(
  row: Readonly<Record<string, unknown>>,
  sort: readonly SortInput<TField>[],
  secret?: string,
): string {
  validateSort(sort);

  const payload: Record<string, string | number | boolean | null> = {};

  for (const entry of sort) {
    payload[entry.field] = toCursorValue(row[entry.field], entry.field);
  }

  return encodeCursor(payload, { secret });
}

/**
 * Turns `limit + 1` fetched rows into a cursor-paginated result.
 *
 * Fetch `limit + 1` rows ordered by `sort`, then pass them here: the extra
 * row signals a next page and is dropped, and `nextCursor` is derived from
 * the last returned row.
 */
export function createKeysetPage<
  TEntity extends Readonly<Record<string, unknown>>,
  TField extends string = string,
>(
  rows: readonly TEntity[],
  options: KeysetPageOptions<TField>,
): CursorPaginatedResult<TEntity> {
  const limit = normalizeLimit(options.limit);

  const hasNextPage = rows.length > limit;

  const data = rows.slice(0, limit);

  const last = data[data.length - 1];

  return createCursorPaginatedResult(data, limit, {
    hasNextPage,
    hasPreviousPage: options.cursor !== undefined && options.cursor !== null,
    nextCursor:
      hasNextPage && last
        ? createKeysetCursor(last, options.sort, options.secret)
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
