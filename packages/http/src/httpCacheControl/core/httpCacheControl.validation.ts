/**
 * Cache control validation.
 *
 * @module httpCacheControl/validation
 */

import { parseCacheControl } from "./httpCacheControl.parse.js";

/**
 * Validates cache control directives for correctness.
 */
export function validateCacheControl(header: string | undefined): {
  readonly valid: boolean;
  readonly errors: readonly string[];
} {
  const errors: string[] = [];
  const directives = parseCacheControl(header);

  errors.push(...findMalformedDeltaSeconds(header));

  if (directives.maxAge !== undefined && directives.maxAge < 0) {
    errors.push("max-age must be non-negative");
  }

  if (directives.sMaxAge !== undefined && directives.sMaxAge < 0) {
    errors.push("s-maxage must be non-negative");
  }

  if (directives.maxStale !== undefined && directives.maxStale < 0) {
    errors.push("max-stale must be non-negative");
  }

  if (directives.minFresh !== undefined && directives.minFresh < 0) {
    errors.push("min-fresh must be non-negative");
  }

  if (
    directives.staleWhileRevalidate !== undefined &&
    directives.staleWhileRevalidate < 0
  ) {
    errors.push("stale-while-revalidate must be non-negative");
  }

  if (directives.staleIfError !== undefined && directives.staleIfError < 0) {
    errors.push("stale-if-error must be non-negative");
  }

  if (directives.private && directives.public) {
    errors.push("cannot have both private and public directives");
  }

  if (
    directives.noStore &&
    (directives.maxAge !== undefined || directives.sMaxAge !== undefined)
  ) {
    errors.push("no-store is incompatible with max-age/s-maxage");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Directives whose value must be `delta-seconds`.
 */
const DELTA_SECONDS_DIRECTIVES = new Set([
  "max-age",
  "s-maxage",
  "max-stale",
  "min-fresh",
  "stale-while-revalidate",
  "stale-if-error",
]);

/**
 * Reports directives whose value is not a valid `delta-seconds`.
 *
 * The parser drops a malformed value, so without this scan
 * `Cache-Control: max-age=abc` would be reported as valid — the validator
 * would see nothing to complain about.
 *
 * @param header - The raw header value.
 * @returns One error message per malformed directive.
 */
function findMalformedDeltaSeconds(header: string | undefined): string[] {
  if (!header) {
    return [];
  }

  const errors: string[] = [];

  for (const part of header.split(",")) {
    const trimmed = part.trim();

    const eqIndex = trimmed.indexOf("=");

    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim().toLowerCase();

    if (!DELTA_SECONDS_DIRECTIVES.has(key)) {
      continue;
    }

    if (!/^\d+$/.test(trimmed.slice(eqIndex + 1).trim())) {
      errors.push(`${key} must be a non-negative integer`);
    }
  }

  return errors;
}
