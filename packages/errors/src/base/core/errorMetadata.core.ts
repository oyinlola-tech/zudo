import type {
  ErrorMetadata,
  ErrorMetadataValue,
} from "./errorMetadata.type.js";

/** Maximum nesting depth accepted for metadata values. */
export const MAX_METADATA_DEPTH = 32;

/** Keys that are never copied into metadata (prototype pollution vectors). */
const FORBIDDEN_METADATA_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/**
 * Default pattern used to recognise metadata keys that carry secrets.
 *
 * Matching is case-insensitive and applies to the whole key, so
 * `Authorization`, `x-api-key`, `headers.cookie` and `refreshToken` all match.
 */
export const SENSITIVE_METADATA_KEY_PATTERN: RegExp =
  /pass(word|code|phrase|wd)?|secret|token|jwt|bearer|private[_-]?key|api[_-]?key|x-api-key|auth(orization|entication)?|cookie|session|credential|client[_-]?secret|ssn|social[_-]?security|card[_-]?number|cvv|cvc|pin\b/i;

/** Placeholder written in place of redacted values. */
export const REDACTED_METADATA_VALUE = "[REDACTED]";

/** Returns whether a metadata key should never be accepted. */
export function isForbiddenMetadataKey(key: string): boolean {
  return FORBIDDEN_METADATA_KEYS.has(key);
}

/**
 * Returns a copy of `pattern` without the `g` and `y` flags.
 *
 * Those flags make `RegExp.prototype.test` advance `lastIndex`, so a shared
 * sensitive-key pattern would redact a key on one call and let the same key
 * through on the next. Every key check in this module goes through here.
 */
function statelessPattern(pattern: RegExp): RegExp {
  if (!pattern.global && !pattern.sticky) return pattern;
  return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""));
}

/** Returns whether a metadata key looks like it carries a secret. */
export function isSensitiveMetadataKey(
  key: string,
  pattern: RegExp = SENSITIVE_METADATA_KEY_PATTERN,
): boolean {
  return statelessPattern(pattern).test(key);
}

/** Returns whether a value is a plain object (Object.prototype or null prototype). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-clones and deep-freezes a metadata value.
 *
 * - Skips forbidden keys (`__proto__`, `constructor`, `prototype`).
 * - Replaces cyclic references with `"[Circular]"`.
 * - Truncates values deeper than `MAX_METADATA_DEPTH` with `"[MaxDepth]"`.
 * - Drops `undefined` entries.
 */
function cloneValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): ErrorMetadataValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return String(value);

  if (depth > MAX_METADATA_DEPTH) return "[MaxDepth]";
  if (seen.has(value)) return "[Circular]";

  if (value instanceof Date) return value.toISOString();

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const result: ErrorMetadataValue[] = [];
      for (const entry of value) {
        const cloned = cloneValue(entry, seen, depth + 1);
        result.push(cloned === undefined ? null : cloned);
      }
      return Object.freeze(result);
    }

    if (value instanceof Map) {
      const result: Record<string, ErrorMetadataValue> = {};
      for (const [key, entry] of value) {
        const stringKey = String(key);
        if (isForbiddenMetadataKey(stringKey)) continue;
        const cloned = cloneValue(entry, seen, depth + 1);
        if (cloned !== undefined) result[stringKey] = cloned;
      }
      return Object.freeze(result);
    }

    if (value instanceof Set) {
      return cloneValue([...value], seen, depth);
    }

    if (value instanceof Error) {
      return Object.freeze({ name: value.name, message: value.message });
    }

    const result: Record<string, ErrorMetadataValue> = {};
    for (const key of Object.keys(value)) {
      if (isForbiddenMetadataKey(key)) continue;
      const cloned = cloneValue(
        (value as Record<string, unknown>)[key],
        seen,
        depth + 1,
      );
      if (cloned !== undefined) result[key] = cloned;
    }
    return Object.freeze(result);
  } finally {
    seen.delete(value);
  }
}

/** Clones an entire metadata object. */
function cloneMetadata(
  metadata: Readonly<Record<string, unknown>>,
): Record<string, ErrorMetadataValue> {
  const cloned = cloneValue(metadata, new WeakSet(), 0);
  if (cloned === undefined || cloned === null || typeof cloned !== "object")
    return {};
  return { ...(cloned as Record<string, ErrorMetadataValue>) };
}

/**
 * Creates an immutable metadata object.
 *
 * The result is a deep-frozen copy: later mutation of the caller's object
 * does not affect the metadata, and nested values cannot be mutated.
 */
export function createErrorMetadata(
  metadata: ErrorMetadata | undefined | null,
): Readonly<ErrorMetadata> {
  if (metadata === undefined || metadata === null) return Object.freeze({});
  return Object.freeze(cloneMetadata(metadata));
}

/** Merges multiple metadata objects. Later metadata objects override earlier values. */
export function mergeErrorMetadata(
  ...metadata: readonly (ErrorMetadata | undefined | null)[]
): Readonly<ErrorMetadata> {
  const merged: Record<string, ErrorMetadataValue> = {};

  for (const current of metadata) {
    if (current === undefined || current === null) continue;
    for (const [key, value] of Object.entries(cloneMetadata(current))) {
      merged[key] = value;
    }
  }

  return Object.freeze(merged);
}

/** Reads a metadata property (own properties only). */
export function getErrorMetadataValue(
  metadata: ErrorMetadata | undefined | null,
  key: string,
): ErrorMetadataValue | undefined {
  if (!hasErrorMetadata(metadata, key)) return undefined;
  return (metadata as ErrorMetadata)[key];
}

/** Determines whether metadata contains a property. */
export function hasErrorMetadata(
  metadata: ErrorMetadata | undefined | null,
  key: string,
): boolean {
  return (
    metadata !== undefined &&
    metadata !== null &&
    Object.prototype.hasOwnProperty.call(metadata, key)
  );
}

/** Removes a metadata property. */
export function omitErrorMetadata(
  metadata: ErrorMetadata | undefined | null,
  ...keys: readonly string[]
): Readonly<ErrorMetadata> {
  if (metadata === undefined || metadata === null) return Object.freeze({});

  const omitted = cloneMetadata(metadata);
  for (const key of keys) delete omitted[key];
  return Object.freeze(omitted);
}

/** Selects only the requested metadata properties. */
export function pickErrorMetadata(
  metadata: ErrorMetadata | undefined | null,
  keys: readonly string[],
): Readonly<ErrorMetadata> {
  if (metadata === undefined || metadata === null) return Object.freeze({});

  const cloned = cloneMetadata(metadata);
  const selected: Record<string, ErrorMetadataValue> = {};
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(cloned, key)) continue;
    const value = cloned[key];
    if (value !== undefined) selected[key] = value;
  }

  return Object.freeze(selected);
}

/** Converts metadata into a plain JSON-safe object. */
export function serializeErrorMetadata(
  metadata: ErrorMetadata | undefined | null,
): Record<string, ErrorMetadataValue> {
  if (metadata === undefined || metadata === null) return {};
  return cloneMetadata(metadata);
}

/**
 * Determines whether an arbitrary value is valid error metadata.
 *
 * Only JSON-compatible primitives, arrays and plain objects qualify;
 * class instances, Maps, Sets, Dates, cyclic and excessively deep values
 * are rejected.
 */
export function isErrorMetadataValue(
  value: unknown,
): value is ErrorMetadataValue {
  return isMetadataValue(value, new WeakSet(), 0);
}

function isMetadataValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (depth > MAX_METADATA_DEPTH) return false;
  if (seen.has(value)) return false;

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.every((entry) => isMetadataValue(entry, seen, depth + 1));
    }
    if (!isPlainObject(value)) return false;
    for (const key of Object.keys(value)) {
      if (isForbiddenMetadataKey(key)) return false;
      const entry = value[key];
      if (entry !== undefined && !isMetadataValue(entry, seen, depth + 1))
        return false;
    }
    return true;
  } finally {
    seen.delete(value);
  }
}

/** Options for `sanitizeErrorMetadata`. */
export interface SanitizeErrorMetadataOptions {
  /**
   * Also redact values whose key looks sensitive (see `redactErrorMetadata`).
   * Defaults to `false`.
   */
  readonly redact?: boolean;
  /** Pattern used to detect sensitive keys when `redact` is enabled. */
  readonly sensitiveKeyPattern?: RegExp;
}

/**
 * Sanitizes arbitrary metadata by removing unsupported values.
 *
 * Drops functions, symbols, class instances and cyclic references, skips
 * prototype-pollution keys and truncates excessive nesting. It does NOT
 * remove secrets unless `redact: true` is passed; use `redactErrorMetadata`
 * for that.
 */
export function sanitizeErrorMetadata(
  metadata: Record<string, unknown> | undefined | null,
  options: SanitizeErrorMetadataOptions = {},
): Readonly<ErrorMetadata> {
  if (metadata === undefined || metadata === null) return Object.freeze({});

  const sanitized = sanitizeValue(metadata, new WeakSet(), 0);
  const result =
    sanitized !== undefined &&
    sanitized !== null &&
    typeof sanitized === "object" &&
    !Array.isArray(sanitized)
      ? { ...(sanitized as Record<string, ErrorMetadataValue>) }
      : {};

  if (options.redact) {
    return redactErrorMetadata(result, {
      sensitiveKeyPattern: options.sensitiveKeyPattern,
    });
  }

  return Object.freeze(result);
}

function sanitizeValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): ErrorMetadataValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "object") return undefined;
  if (depth > MAX_METADATA_DEPTH) return undefined;
  if (seen.has(value)) return undefined;

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const result: ErrorMetadataValue[] = [];
      for (const entry of value) {
        const cleaned = sanitizeValue(entry, seen, depth + 1);
        if (cleaned !== undefined) result.push(cleaned);
      }
      return Object.freeze(result);
    }
    if (!isPlainObject(value)) return undefined;

    const result: Record<string, ErrorMetadataValue> = {};
    for (const key of Object.keys(value)) {
      if (isForbiddenMetadataKey(key)) continue;
      const cleaned = sanitizeValue(value[key], seen, depth + 1);
      if (cleaned !== undefined) result[key] = cleaned;
    }
    return Object.freeze(result);
  } finally {
    seen.delete(value);
  }
}

/** Options for `redactErrorMetadata`. */
export interface RedactErrorMetadataOptions {
  /** Pattern matched (case-insensitively) against every key at every depth. */
  readonly sensitiveKeyPattern?: RegExp;
  /** Additional exact keys to redact. */
  readonly keys?: readonly string[];
  /** Replacement value. Defaults to `"[REDACTED]"`. */
  readonly replacement?: string;
}

/**
 * Redacts sensitive values from metadata.
 *
 * Walks the metadata recursively and replaces the value of every key that
 * matches the sensitive-key pattern (case-insensitive) or one of the extra
 * `keys` with `"[REDACTED]"`. Unsupported values are dropped as in
 * `sanitizeErrorMetadata`.
 */
export function redactErrorMetadata(
  metadata: Record<string, unknown> | undefined | null,
  options: RedactErrorMetadataOptions = {},
): Readonly<ErrorMetadata> {
  if (metadata === undefined || metadata === null) return Object.freeze({});

  const pattern = statelessPattern(
    options.sensitiveKeyPattern ?? SENSITIVE_METADATA_KEY_PATTERN,
  );
  const extraKeys = new Set((options.keys ?? []).map((key) => key.toLowerCase()));
  const replacement = options.replacement ?? REDACTED_METADATA_VALUE;

  const isSensitive = (key: string): boolean =>
    pattern.test(key) || extraKeys.has(key.toLowerCase());

  const redacted = redactValue(metadata, isSensitive, replacement, new WeakSet(), 0);
  if (
    redacted === undefined ||
    redacted === null ||
    typeof redacted !== "object" ||
    Array.isArray(redacted)
  )
    return Object.freeze({});
  return Object.freeze({ ...(redacted as Record<string, ErrorMetadataValue>) });
}

function redactValue(
  value: unknown,
  isSensitive: (key: string) => boolean,
  replacement: string,
  seen: WeakSet<object>,
  depth: number,
): ErrorMetadataValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "object") return undefined;
  if (depth > MAX_METADATA_DEPTH) return undefined;
  if (seen.has(value)) return undefined;

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const result: ErrorMetadataValue[] = [];
      for (const entry of value) {
        const cleaned = redactValue(entry, isSensitive, replacement, seen, depth + 1);
        if (cleaned !== undefined) result.push(cleaned);
      }
      return Object.freeze(result);
    }
    if (!isPlainObject(value)) return undefined;

    const result: Record<string, ErrorMetadataValue> = {};
    for (const key of Object.keys(value)) {
      if (isForbiddenMetadataKey(key)) continue;
      if (isSensitive(key)) {
        if (value[key] !== undefined) result[key] = replacement;
        continue;
      }
      const cleaned = redactValue(value[key], isSensitive, replacement, seen, depth + 1);
      if (cleaned !== undefined) result[key] = cleaned;
    }
    return Object.freeze(result);
  } finally {
    seen.delete(value);
  }
}
