/**
 * Redaction of non-BaseError cause values (plain objects, arrays).
 *
 * Internal to `@zudojs/errors`: shared by `BaseError.toJSON` and
 * `ErrorSerializer`, not re-exported from the package barrel.
 *
 * @module base/core/errorCause.redact
 */

import {
  isForbiddenMetadataKey,
  isSensitiveMetadataKey,
  MAX_METADATA_DEPTH,
  REDACTED_METADATA_VALUE,
} from "./errorMetadata.core.js";

/** Marker substituted for a cause subtree deeper than {@link MAX_METADATA_DEPTH}. */
const MAX_DEPTH_VALUE = "[MaxDepth]";

/** Plain objects (Object.prototype or null prototype) are walked; anything else is kept as-is. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
}

/**
 * Redacts sensitive keys inside a record without changing its shape:
 * primitives, dates and class instances are kept, plain objects and arrays
 * are walked, cycles stop at `"[Circular]"`, prototype keys are dropped.
 *
 * The walk is depth-bounded exactly as metadata cloning is: a subtree past
 * {@link MAX_METADATA_DEPTH} becomes `"[MaxDepth]"`. Without that bound a
 * parsed request body attached as a cause could overflow the stack *inside*
 * the serializer, turning a logged error into an uncaught `RangeError`.
 */
export function redactCauseFields(
  fields: Record<string, unknown>,
  pattern: RegExp | undefined,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    if (isForbiddenMetadataKey(key)) continue;
    const sensitive =
      pattern === undefined
        ? isSensitiveMetadataKey(key)
        : isSensitiveMetadataKey(key, pattern);
    result[key] = sensitive
      ? REDACTED_METADATA_VALUE
      : redactCauseValue(fields[key], pattern, seen, depth + 1);
  }
  return result;
}

/**
 * Redacts one cause value: arrays and plain objects are walked, every other
 * value is returned unchanged. Walking stops at {@link MAX_METADATA_DEPTH}.
 */
export function redactCauseValue(
  value: unknown,
  pattern: RegExp | undefined,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): unknown {
  if (Array.isArray(value)) {
    if (depth > MAX_METADATA_DEPTH) return MAX_DEPTH_VALUE;
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    try {
      return value.map((entry) =>
        redactCauseValue(entry, pattern, seen, depth + 1),
      );
    } finally {
      seen.delete(value);
    }
  }
  if (!isPlainRecord(value)) return value;
  if (depth > MAX_METADATA_DEPTH) return MAX_DEPTH_VALUE;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  try {
    return redactCauseFields(value, pattern, seen, depth);
  } finally {
    seen.delete(value);
  }
}
