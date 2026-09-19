/**
 * Validating branded-type factories: tenant ids, timestamps and email
 * addresses. Each rejects input that the brand promises is impossible.
 *
 * @module common/factory
 */

import type { EmailAddress, TenantId, Timestamp } from "./common.type.js";
import { ValidationPattern } from "../validation/validation.pattern.type.js";
import { ValidationLength } from "../validation/validation.constant.js";
import { InvalidConstantError } from "../constantsErrors/constantsError.base.js";

/**
 * Characters a tenant id may contain, after normalization.
 *
 * A tenant id is concatenated into cache keys, log lines, schema names and
 * file paths, so anything that could act as a separator or a path segment is
 * rejected here rather than escaped at every use site. Matches the rule in
 * `@zudojs/tenancy`.
 */
export const TENANT_ID_PATTERN: RegExp = /^[a-z0-9][a-z0-9_-]*$/u;

/** Maximum accepted tenant id length. */
export const MAX_TENANT_ID_LENGTH = 64;

/**
 * Create a validated, normalized TenantId.
 *
 * Input is NFKC-normalized, trimmed and lowercased, then checked against
 * {@link TENANT_ID_PATTERN} and {@link MAX_TENANT_ID_LENGTH}, so two
 * spellings of one tenant cannot become two tenants and no id can carry a
 * separator or path segment.
 *
 * @throws {InvalidConstantError} when the value is not a valid tenant id.
 */
export function createTenantId(id: string): TenantId {
  const normalized =
    typeof id === "string" ? id.normalize("NFKC").trim().toLowerCase() : "";
  if (
    normalized.length === 0 ||
    normalized.length > MAX_TENANT_ID_LENGTH ||
    !TENANT_ID_PATTERN.test(normalized)
  ) {
    throw new InvalidConstantError(`Invalid tenant id: ${JSON.stringify(id)}`);
  }
  return normalized as TenantId;
}

const ISO_PARTS =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))?$/;

/**
 * Whether an ISO 8601 date-time names an instant that exists.
 *
 * `Date.parse` rolls day overflow into the next month (`2024-02-30` becomes
 * March 1), so the calendar date is round-tripped through `Date.UTC` and the
 * time and offset fields are range-checked explicitly.
 */
function isRealIsoDateTime(iso: string): boolean {
  const match = ISO_PARTS.exec(iso);
  if (match === null) return false;
  const [year, month, day, hour, minute, second, offH, offM] = match
    .slice(1)
    .map((part) => (part === undefined ? 0 : Number(part)));
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day &&
    hour! <= 23 &&
    minute! <= 59 &&
    second! <= 59 &&
    offH! <= 23 &&
    offM! <= 59
  );
}

/**
 * Create a branded Timestamp from an ISO 8601 string.
 *
 * @throws {InvalidConstantError} if the input is not a valid ISO 8601
 * date-time string (e.g. `2024-01-01T00:00:00.000Z`) naming a real calendar
 * date and time.
 */
export function createTimestamp(iso: string): Timestamp {
  if (
    typeof iso !== "string" ||
    !ValidationPattern.ISO_DATE_TIME.test(iso) ||
    !isRealIsoDateTime(iso)
  ) {
    throw new InvalidConstantError(
      `Invalid ISO 8601 timestamp: ${JSON.stringify(iso)}`,
    );
  }
  return iso as Timestamp;
}

/**
 * Create a branded EmailAddress from a raw string.
 *
 * Accepts exactly what `ValidationPattern.EMAIL` accepts, which is the same
 * set as `isEmail` in `@zudojs/types`, bounded at 254 characters.
 *
 * @throws {InvalidConstantError} if the input is not a valid email address.
 */
export function createEmailAddress(email: string): EmailAddress {
  if (
    typeof email !== "string" ||
    email.length > ValidationLength.EMAIL ||
    !ValidationPattern.EMAIL.test(email)
  ) {
    throw new InvalidConstantError(
      `Invalid email address: ${JSON.stringify(email)}`,
    );
  }
  return email as EmailAddress;
}
