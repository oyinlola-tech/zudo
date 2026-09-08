import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  PaginationInput,
  PaginationMeta,
  PaginatedResult,
} from "../databaseType/databaseType.type.js";

/**
 * Default pagination values.
 */
export const DEFAULT_PAGE = 1;

export const DEFAULT_LIMIT = 20;

export const MAX_LIMIT = 100;

/**
 * Normalized pagination configuration.
 */
export interface NormalizedPagination {
  readonly page: number;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Cursor pagination request.
 */
export interface CursorPaginationInput {
  readonly cursor?: string | null;
  readonly limit?: number;
}

/**
 * Cursor pagination metadata.
 */
export interface CursorPaginationMeta {
  readonly limit: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
  readonly nextCursor?: string;
  readonly previousCursor?: string;
}

/**
 * Cursor paginated result.
 */
export interface CursorPaginatedResult<TEntity> {
  readonly data: readonly TEntity[];
  readonly meta: CursorPaginationMeta;
}

/**
 * Normalizes page and limit values.
 */
export function normalizePagination(
  input?: PaginationInput,
): NormalizedPagination {
  const page = normalizePage(input?.page);

  const limit = normalizeLimit(input?.limit);

  return {
    page,
    limit,
    offset: calculateOffset(page, limit),
  };
}

/**
 * Normalizes a page number.
 */
export function normalizePage(page?: number): number {
  if (page === undefined || !Number.isFinite(page)) {
    return DEFAULT_PAGE;
  }

  return Math.max(1, Math.floor(page));
}

/**
 * Normalizes a page size.
 */
export function normalizeLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

/**
 * Calculates the database offset for a page.
 */
export function calculateOffset(page: number, limit: number): number {
  return (normalizePage(page) - 1) * normalizeLimit(limit);
}

/**
 * Calculates the total number of pages.
 */
export function calculateTotalPages(total: number, limit: number): number {
  const normalizedTotal = Math.max(0, Math.floor(total));

  const normalizedLimit = normalizeLimit(limit);

  if (normalizedTotal === 0) {
    return 0;
  }

  return Math.ceil(normalizedTotal / normalizedLimit);
}

/**
 * Creates pagination metadata.
 */
export function createPaginationMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  const normalizedPage = normalizePage(page);

  const normalizedLimit = normalizeLimit(limit);

  const normalizedTotal = Math.max(0, Math.floor(total));

  const totalPages = calculateTotalPages(normalizedTotal, normalizedLimit);

  const hasNextPage = totalPages > 0 && normalizedPage < totalPages;

  const hasPreviousPage = normalizedPage > 1 && totalPages > 0;

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    total: normalizedTotal,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    hasNext: hasNextPage,
    hasPrev: hasPreviousPage,
  };
}

/**
 * Creates a paginated result.
 */
export function createPaginatedResult<TEntity>(
  data: readonly TEntity[],
  page: number,
  limit: number,
  total: number,
): PaginatedResult<TEntity> {
  return {
    data: [...data],
    meta: createPaginationMeta(page, limit, total),
  };
}

/**
 * Gets the next page number.
 */
export function getNextPage(meta: PaginationMeta): number | null {
  if (!meta.hasNextPage) {
    return null;
  }

  return meta.page + 1;
}

/**
 * Gets the previous page number.
 */
export function getPreviousPage(meta: PaginationMeta): number | null {
  if (!meta.hasPreviousPage) {
    return null;
  }

  return Math.max(1, meta.page - 1);
}

/**
 * Checks whether a page number is valid for the result set.
 */
export function isValidPage(page: number, totalPages: number): boolean {
  if (!Number.isFinite(page) || !Number.isFinite(totalPages)) {
    return false;
  }

  const normalizedPage = Math.floor(page);

  const normalizedTotalPages = Math.max(0, Math.floor(totalPages));

  if (normalizedTotalPages === 0) {
    return normalizedPage === 1;
  }

  return normalizedPage >= 1 && normalizedPage <= normalizedTotalPages;
}

/**
 * Calculates the item range represented by a page.
 *
 * For example, page 2 with a limit of 20 and total of 55 returns
 * `{ start: 21, end: 40 }`.
 */
export function getItemRange(
  page: number,
  limit: number,
  total: number,
): {
  readonly start: number;
  readonly end: number;
} {
  const normalizedPage = normalizePage(page);

  const normalizedLimit = normalizeLimit(limit);

  const normalizedTotal = Math.max(0, Math.floor(total));

  if (normalizedTotal === 0) {
    return {
      start: 0,
      end: 0,
    };
  }

  const start = calculateOffset(normalizedPage, normalizedLimit) + 1;

  const end = Math.min(start + normalizedLimit - 1, normalizedTotal);

  if (start > normalizedTotal) {
    // The page lies past the end of the data set: there is no item range.
    return {
      start: 0,
      end: 0,
    };
  }

  return {
    start,
    end,
  };
}

/**
 * Applies offset pagination to an in-memory collection.
 *
 * This is useful for adapters and tests that need the same pagination
 * semantics without querying the database directly.
 */
export function paginateCollection<TEntity>(
  items: readonly TEntity[],
  input?: PaginationInput,
): PaginatedResult<TEntity> {
  const pagination = normalizePagination(input);

  const total = items.length;

  const data = items.slice(
    pagination.offset,
    pagination.offset + pagination.limit,
  );

  return createPaginatedResult(data, pagination.page, pagination.limit, total);
}

/**
 * Normalizes cursor pagination input.
 */
export function normalizeCursorPagination(
  input?: CursorPaginationInput,
): Required<Pick<CursorPaginationInput, "limit">> &
  Pick<CursorPaginationInput, "cursor"> {
  return {
    cursor: input?.cursor ?? null,
    limit: normalizeLimit(input?.limit),
  };
}

/**
 * Creates cursor pagination metadata.
 */
export function createCursorPaginationMeta(
  limit: number,
  options: {
    readonly hasNextPage: boolean;
    readonly hasPreviousPage?: boolean;
    readonly nextCursor?: string | null;
    readonly previousCursor?: string | null;
  },
): CursorPaginationMeta {
  return {
    limit: normalizeLimit(limit),
    hasNextPage: options.hasNextPage,
    hasPreviousPage: options.hasPreviousPage ?? false,
    nextCursor: options.nextCursor ?? undefined,
    previousCursor: options.previousCursor ?? undefined,
  };
}

/**
 * Creates a cursor paginated result.
 */
export function createCursorPaginatedResult<TEntity>(
  data: readonly TEntity[],
  limit: number,
  options: {
    readonly hasNextPage: boolean;
    readonly hasPreviousPage?: boolean;
    readonly nextCursor?: string | null;
    readonly previousCursor?: string | null;
  },
): CursorPaginatedResult<TEntity> {
  return {
    data: [...data],
    meta: createCursorPaginationMeta(limit, options),
  };
}

/**
 * Options for encoding a cursor.
 */
export interface EncodeCursorOptions {
  /**
   * When supplied the cursor is signed with HMAC-SHA256 so clients cannot
   * forge or tamper with its payload.
   */
  readonly secret?: string;
}

/**
 * Options for decoding a cursor.
 */
export interface DecodeCursorOptions extends EncodeCursorOptions {
  /**
   * Keys the decoded payload may contain. Any other key is rejected.
   */
  readonly allowedFields?: readonly string[];
}

/**
 * A validated cursor payload: a flat object of primitive values.
 */
export type CursorPayload = Readonly<
  Record<string, string | number | boolean | null>
>;

const CURSOR_SIGNATURE_SEPARATOR = ".";

const FORBIDDEN_CURSOR_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Encodes a cursor value.
 *
 * Without a `secret` the cursor is plain base64url JSON and must be treated
 * as client-controlled input; pass `allowedFields` to `decodeCursor` (or
 * use a secret) before feeding it to a query.
 */
export function encodeCursor(
  value: unknown,
  options: EncodeCursorOptions = {},
): string {
  const serialized = JSON.stringify(value);

  if (typeof serialized !== "string") {
    throw new TypeError("Cursor value could not be serialized.");
  }

  const payload = Buffer.from(serialized, "utf8").toString("base64url");

  if (options.secret === undefined) {
    return payload;
  }

  validateSecret(options.secret);

  return `${payload}${CURSOR_SIGNATURE_SEPARATOR}${signCursor(
    payload,
    options.secret,
  )}`;
}

/**
 * Decodes a cursor value.
 *
 * When `secret` is supplied the signature is verified; when
 * `allowedFields` is supplied the payload must be a flat object whose keys
 * are all allowed and whose values are primitives.
 */
export function decodeCursor<T = unknown>(
  cursor: string,
  options: DecodeCursorOptions = {},
): T {
  if (typeof cursor !== "string" || cursor.trim().length === 0) {
    throw new TypeError("A cursor value is required.");
  }

  let payload = cursor;

  if (options.secret !== undefined) {
    validateSecret(options.secret);

    const separator = cursor.lastIndexOf(CURSOR_SIGNATURE_SEPARATOR);

    if (separator <= 0) {
      throw new TypeError("Invalid pagination cursor signature.");
    }

    payload = cursor.slice(0, separator);

    const signature = cursor.slice(separator + 1);

    const expected = signCursor(payload, options.secret);

    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      throw new TypeError("Invalid pagination cursor signature.");
    }
  }

  let decoded: unknown;

  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch (error) {
    throw new TypeError("Invalid pagination cursor.", {
      cause: error,
    });
  }

  if (options.allowedFields !== undefined) {
    validateCursorPayload(decoded, options.allowedFields);
  }

  return decoded as T;
}

/**
 * Validates that a decoded cursor is a flat object of primitive values
 * restricted to the allowed fields.
 */
export function validateCursorPayload(
  value: unknown,
  allowedFields: readonly string[],
): asserts value is CursorPayload {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Pagination cursor payload must be an object.");
  }

  const allowed = new Set(allowedFields);

  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_CURSOR_KEYS.has(key) || !allowed.has(key)) {
      throw new TypeError(
        `Pagination cursor contains an unexpected field "${key}".`,
      );
    }

    if (
      entry !== null &&
      typeof entry !== "string" &&
      typeof entry !== "number" &&
      typeof entry !== "boolean"
    ) {
      throw new TypeError(
        `Pagination cursor field "${key}" must be a primitive value.`,
      );
    }
  }
}

function signCursor(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function validateSecret(secret: string): void {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new TypeError("A cursor secret must be a non-empty string.");
  }
}
