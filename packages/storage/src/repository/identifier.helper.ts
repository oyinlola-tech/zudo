/**
 * @zudojs/storage — SQL identifier and pagination guards.
 *
 * Repository query builders interpolate identifiers (table, column and sort
 * column names) directly into SQL because no driver allows binding them as
 * parameters. Every such value must therefore pass through this module first.
 */

import { StorageError } from "@zudojs/errors";

/** Identifiers accepted without quoting: a leading letter or underscore, then word characters. */
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/u;

/** Maximum identifier length accepted, matching the shortest limit across supported engines. */
const MAX_IDENTIFIER_LENGTH = 63;

/** Sort directions accepted by {@link assertSortDirection}. */
export type SortDirection = "ASC" | "DESC";

/**
 * Assert that a value is usable as a SQL identifier.
 *
 * @param value - The candidate identifier.
 * @param role - What the identifier is for, used in the error message.
 * @returns The identifier, unchanged.
 * @throws {StorageError} when the value is not a plain, unqualified identifier.
 */
export function assertIdentifier(value: unknown, role: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new StorageError(`Invalid ${role}: expected a non-empty string`, {
      code: "STORAGE_INVALID_IDENTIFIER",
      statusCode: 400,
    });
  }

  if (value.length > MAX_IDENTIFIER_LENGTH) {
    throw new StorageError(
      `Invalid ${role}: exceeds ${MAX_IDENTIFIER_LENGTH} characters`,
      { code: "STORAGE_INVALID_IDENTIFIER", statusCode: 400 },
    );
  }

  if (!SAFE_IDENTIFIER.test(value)) {
    throw new StorageError(
      `Invalid ${role}: only letters, digits and underscores are allowed`,
      { code: "STORAGE_INVALID_IDENTIFIER", statusCode: 400 },
    );
  }

  return value;
}

/**
 * Assert that every entry of a list is usable as a SQL identifier.
 *
 * When `allowed` is supplied the identifier must also be a member of it, which
 * is the stronger guarantee callers should prefer wherever a column allowlist
 * is known.
 *
 * @param values - The candidate identifiers.
 * @param role - What the identifiers are for, used in error messages.
 * @param allowed - Optional allowlist of permitted identifiers.
 * @returns The identifiers, unchanged.
 * @throws {StorageError} when any value fails validation.
 */
export function assertIdentifiers(
  values: readonly unknown[],
  role: string,
  allowed?: ReadonlySet<string>,
): readonly string[] {
  return values.map((value) => {
    const identifier = assertIdentifier(value, role);
    if (allowed && !allowed.has(identifier)) {
      throw new StorageError(
        `Invalid ${role}: "${identifier}" is not allowed`,
        {
          code: "STORAGE_IDENTIFIER_NOT_ALLOWED",
          statusCode: 400,
        },
      );
    }
    return identifier;
  });
}

/**
 * Assert that a value is a sort direction.
 *
 * @param value - The candidate direction, or undefined for the default.
 * @returns The normalized direction.
 * @throws {StorageError} when the value is neither ASC nor DESC.
 */
export function assertSortDirection(value: unknown): SortDirection {
  if (value === undefined) return "ASC";

  const normalized = typeof value === "string" ? value.toUpperCase() : "";
  if (normalized !== "ASC" && normalized !== "DESC") {
    throw new StorageError("Invalid sort direction: expected ASC or DESC", {
      code: "STORAGE_INVALID_SORT_DIRECTION",
      statusCode: 400,
    });
  }

  return normalized;
}

/**
 * Assert that a value is a safe non-negative integer for LIMIT or OFFSET.
 *
 * The declared parameter type is `number`, but these values almost always
 * originate as request query strings, where the type annotation guarantees
 * nothing at runtime.
 *
 * @param value - The candidate bound.
 * @param role - Either "limit" or "offset", used in the error message.
 * @returns The validated integer.
 * @throws {StorageError} when the value is not a safe non-negative integer.
 */
export function assertRowBound(value: unknown, role: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new StorageError(
      `Invalid ${role}: expected a non-negative safe integer`,
      { code: "STORAGE_INVALID_ROW_BOUND", statusCode: 400 },
    );
  }

  return value;
}
