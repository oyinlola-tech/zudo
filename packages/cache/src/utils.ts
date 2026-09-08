/**
 * @zudojs/cache — Internal Utilities
 *
 * Shared helpers: glob matching, sequential delete-many fallback,
 * TTL/pattern validation, and a monotonic clock.
 */

import type {
  CacheDeleteManyResult,
  CacheDeleteResult,
  CacheKey,
  CacheTTL,
} from "./types.js";
import type { CacheErrorCode } from "./types-config.js";
import {
  CACHE_PATTERN_PART_PATTERN,
  DEFAULT_SEPARATOR,
  MAX_KEY_LENGTH,
  MAX_TTL_MS,
  MIN_TTL_MS,
} from "./constants.js";
import { CacheError, cacheInvalidKeyError } from "./errors.js";

/* -------------------------------------------------------------------------- */
/* Monotonic clock                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Monotonic milliseconds since process start. Unlike `Date.now()` this is
 * unaffected by NTP steps, VM resume, or manual clock changes, so deadlines
 * computed from it cannot be extended or collapsed by a wall-clock jump.
 *
 * Use `wallClockFor()` to convert a monotonic deadline back into a `Date`
 * for human-facing fields.
 */
export function monotonicNow(): number {
  return performance.now();
}

/** Converts a monotonic timestamp into an approximate wall-clock `Date`. */
export function wallClockFor(monotonicMs: number): Date {
  return new Date(performance.timeOrigin + monotonicMs);
}

/* -------------------------------------------------------------------------- */
/* Glob matching                                                              */
/* -------------------------------------------------------------------------- */

type GlobToken =
  | { readonly kind: "literal"; readonly char: string }
  | { readonly kind: "single" }
  | { readonly kind: "star" };

/**
 * Splits one pattern segment into tokens, collapsing runs of `*` into a
 * single star token. Collapsing is what makes matching cheap: without it a
 * pattern of *n* consecutive stars is a catastrophic-backtracking hazard.
 */
function tokenizeSegment(segment: string): readonly GlobToken[] {
  const tokens: GlobToken[] = [];
  for (const char of segment) {
    if (char === "*") {
      if (tokens[tokens.length - 1]?.kind === "star") continue;
      tokens.push({ kind: "star" });
    } else if (char === "?") {
      tokens.push({ kind: "single" });
    } else {
      tokens.push({ kind: "literal", char });
    }
  }
  return tokens;
}

/**
 * Classic linear wildcard matcher (greedy with single-star backtracking).
 * Runs in O(pattern × value) worst case and O(value) in practice — it can
 * never backtrack exponentially.
 */
function matchSegment(tokens: readonly GlobToken[], value: string): boolean {
  let ti = 0;
  let vi = 0;
  let starTi = -1;
  let starVi = 0;
  while (vi < value.length) {
    const token = tokens[ti];
    if (
      token !== undefined &&
      ((token.kind === "literal" && token.char === value[vi]) ||
        token.kind === "single")
    ) {
      ti++;
      vi++;
      continue;
    }
    if (token !== undefined && token.kind === "star") {
      starTi = ti;
      starVi = vi;
      ti++;
      continue;
    }
    if (starTi >= 0) {
      starVi++;
      vi = starVi;
      ti = starTi + 1;
      continue;
    }
    return false;
  }
  while (tokens[ti]?.kind === "star") ti++;
  return ti === tokens.length;
}

/** A compiled glob matcher. */
export type GlobMatcher = (value: string) => boolean;

/**
 * Compiles a glob pattern into a linear-time matcher.
 *
 * Semantics (deliberately segment-aware, so a wildcard cannot escape the
 * scope it was written for):
 * - `*` matches any run of characters **within a single key segment**; it
 *   never crosses the separator. `zudojs:*` therefore matches `zudojs:a`
 *   but not `zudojs:tenant:a`.
 * - `?` matches exactly one character within a segment.
 * - `**` as a whole segment matches zero or more whole segments, so
 *   `zudojs:**` matches every key under the `zudojs` prefix.
 *
 * The pattern is length-bounded (see `assertValidPattern`) and star runs are
 * collapsed, so pathological patterns cannot cause catastrophic backtracking.
 */
export function createGlobMatcher(
  pattern: string,
  options?: { readonly separator?: string },
): GlobMatcher {
  assertValidPattern(pattern);
  const separator = options?.separator ?? DEFAULT_SEPARATOR;
  const rawSegments = pattern.split(separator);
  const compiled = rawSegments.map((segment) =>
    segment === "**"
      ? ("globstar" as const)
      : { tokens: tokenizeSegment(segment) },
  );

  return (value: string): boolean => {
    const valueSegments = value.split(separator);
    // Two-pointer match at the segment level: `**` behaves as a star over
    // whole segments, using the same linear greedy algorithm.
    let pi = 0;
    let vi = 0;
    let starPi = -1;
    let starVi = 0;
    while (vi < valueSegments.length) {
      const part = compiled[pi];
      if (
        part !== undefined &&
        part !== "globstar" &&
        matchSegment(part.tokens, valueSegments[vi]!)
      ) {
        pi++;
        vi++;
        continue;
      }
      if (part === "globstar") {
        starPi = pi;
        starVi = vi;
        pi++;
        continue;
      }
      if (starPi >= 0) {
        starVi++;
        vi = starVi;
        pi = starPi + 1;
        continue;
      }
      return false;
    }
    while (compiled[pi] === "globstar") pi++;
    return pi === compiled.length;
  };
}

/**
 * Validates a glob pattern before it is compiled or composed into a key
 * pattern. Patterns are untrusted input on every pattern-based entry point,
 * so they are bounded in length and restricted to the key alphabet plus the
 * glob metacharacters and the separator.
 */
export function assertValidPattern(pattern: string): void {
  if (pattern.length === 0) {
    throw cacheInvalidKeyError(pattern, "Cache pattern must not be empty.");
  }
  if (pattern.length > MAX_KEY_LENGTH) {
    throw cacheInvalidKeyError(
      pattern,
      `Cache pattern exceeds maximum length of ${MAX_KEY_LENGTH} characters.`,
    );
  }
}

/**
 * Validates a single pattern segment supplied by a caller (the part that is
 * appended after prefix/namespace). Only the key alphabet plus `*` and `?`
 * have meaning; anything else is caller error.
 */
export function assertValidPatternPart(part: string, separator: string): void {
  if (part.length === 0) {
    throw cacheInvalidKeyError(part, "Cache pattern must not be empty.");
  }
  if (part.includes(separator) || !CACHE_PATTERN_PART_PATTERN.test(part)) {
    throw cacheInvalidKeyError(
      part,
      `Invalid cache pattern "${part}": patterns must match ${String(
        CACHE_PATTERN_PART_PATTERN,
      )} and must not contain the separator "${separator}".`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Deletes many keys by calling a single-key delete function sequentially.
 * Shared fallback used by the memory adapter, the store, and the
 * invalidation manager.
 */
export async function deleteManyViaDelete(
  keys: readonly CacheKey[],
  deleteOne: (key: CacheKey) => Promise<CacheDeleteResult>,
): Promise<CacheDeleteManyResult> {
  let deleted = 0;
  const deletedKeys: CacheKey[] = [];
  for (const key of keys) {
    const result = await deleteOne(key);
    if (result.deleted) {
      deleted++;
      deletedKeys.push(key);
    }
  }
  return { deleted, keys: deletedKeys };
}

/**
 * Validates a TTL value. `null` means "never expires" and `undefined`
 * means "use the default"; both are valid. Finite numbers must be within
 * [MIN_TTL_MS, MAX_TTL_MS]. Throws a CacheError with the
 * `CACHE_INVALID_TTL` code otherwise.
 */
export function assertValidTtl(ttl: CacheTTL | undefined): void {
  if (ttl === null || ttl === undefined) return;
  if (!Number.isFinite(ttl) || ttl < MIN_TTL_MS || ttl > MAX_TTL_MS) {
    const code: CacheErrorCode = "CACHE_INVALID_TTL";
    throw new CacheError(
      `Invalid cache TTL: ${ttl}. TTL must be between ${MIN_TTL_MS} and ${MAX_TTL_MS} ms, or null for no expiry.`,
      {
        code,
        statusCode: 400,
        expose: true,
        metadata: { ttl },
      },
    );
  }
}
