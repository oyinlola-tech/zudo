/**
 * Type guard functions for common JavaScript/TypeScript types.
 *
 * @module typeGuards/typeGuards
 */

/**
 * Check if a value is a plain object (not an array, null, or class instance).
 */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Check if a value is a non-null object.
 */
export function isNonNullObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Check if a value is a non-empty string.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Check if a value is a finite number.
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Check if a value is a positive, finite number.
 *
 * `Infinity` is excluded: a positive-number guard is normally protecting a
 * size, a count or a price, none of which have a meaningful infinite value.
 */
export function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

/**
 * Check if a value is a valid integer.
 */
export function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/**
 * Check if a value is a valid Date object.
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Check if a value is a valid URL string.
 */
export function isUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Check if a value is a valid email string.
 *
 * This is the monorepo's single email check; `@zudojs/validation` re-exports
 * it as the `email` constraint. Two implementations previously disagreed
 * about the same address, so a value accepted at the edge could be rejected
 * halfway through a request.
 */
export function isEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.includes("..")) return false;
  return /^[^\s@,;<>"[\]\\]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/iu.test(
    value,
  );
}

/**
 * Check if a value is a UUID string of any defined version.
 *
 * Accepts versions 1 through 8 — UUIDv7 included — plus the nil and max
 * UUIDs. Use {@link isUuidV4} when the version genuinely matters.
 */
export function isUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value === "00000000-0000-0000-0000-000000000000") return true;
  if (value.toLowerCase() === "ffffffff-ffff-ffff-ffff-ffffffffffff") {
    return true;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

/**
 * Check if a value is specifically a UUID v4 string.
 */
export function isUuidV4(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

/**
 * Check if a value is a valid ISO 8601 date string, with or without a time.
 *
 * Validates the calendar date as well as the shape, and accepts numeric UTC
 * offsets. Checking digit counts alone accepted `2024-13-45T99:99:99Z` and
 * rejected `2024-01-01T00:00:00+02:00` — wrong in both directions.
 *
 * Use {@link isIsoDateTimeString} where a time component is required.
 */
export function isIsoDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;

  if (
    !/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/u.test(
      value,
    )
  ) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const asUtc = new Date(Date.UTC(year!, month! - 1, day!));

  return (
    asUtc.getUTCFullYear() === year &&
    asUtc.getUTCMonth() === month! - 1 &&
    asUtc.getUTCDate() === day
  );
}

/**
 * Check if a value is a valid ISO 8601 date-time string.
 *
 * Like {@link isIsoDateString}, but a time component is mandatory.
 */
export function isIsoDateTimeString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/[T ]\d{2}:\d{2}/u.test(value)) return false;
  return isIsoDateString(value);
}

/**
 * Check if a value is an array of a specific element type.
 */
export function isArrayOfType<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
): value is T[] {
  if (!Array.isArray(value)) return false;
  return value.every(guard);
}

/**
 * Check if a value is defined (not null or undefined).
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Check if a value is a function.
 */
export function isFunction(
  value: unknown,
): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

/**
 * Check if a value is a native Promise.
 */
export function isPromise(value: unknown): value is Promise<unknown> {
  return value instanceof Promise;
}

/**
 * Check if a value is awaitable.
 *
 * Narrows to `PromiseLike`, not `Promise`: a plain thenable is safe to
 * `await` but has no `.catch()` or `.finally()`, so claiming it is a Promise
 * makes those calls throw at the point the guard was supposed to make safe.
 */
export function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (value instanceof Promise) return true;
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as Record<string, unknown>).then === "function"
  );
}
