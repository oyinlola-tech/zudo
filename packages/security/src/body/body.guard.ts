/**
 * @zudojs/security — Body limit guards.
 */

import { ConfigurationError } from "@zudojs/errors";

/**
 * True when `value` is usable as a body size limit: a finite number above 0.
 *
 * `NaN` is the case that matters. `Number(process.env.BODY_LIMIT)` with the
 * variable unset yields `NaN`, which slipped past `limit <= 0` and made every
 * `size > limit` comparison false, so an unset limit allowed any body.
 */
export function isUsableBodyLimit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Throws unless `value` is a usable body size limit.
 *
 * @throws {ConfigurationError} when `value` is `NaN`, infinite, zero,
 *   negative or not a number.
 */
export function assertBodyLimit(value: unknown, name = "maxSize"): asserts value is number {
  if (!isUsableBodyLimit(value)) {
    throw new ConfigurationError(
      `Body limit ${name} must be a finite number of bytes above 0, got: ${String(value)}`,
    );
  }
}
