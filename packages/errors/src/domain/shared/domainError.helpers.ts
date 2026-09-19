/**
 * Shared helpers for domain error classes.
 *
 * These utilities keep untrusted input out of error messages, make
 * normalizers robust against exotic thrown values, and validate the
 * numeric arguments that domain errors record.
 */

import type { ErrorMetadata } from "../../base/core/errorMetadata.type.js";

/** Default maximum length for untrusted strings embedded in messages. */
export const MAX_MESSAGE_FRAGMENT_LENGTH = 200;

/**
 * Characters that must not reach logs: C0, DEL and C1 controls, the Unicode
 * line and paragraph separators (U+2028/U+2029, which break log lines in
 * viewers that honour them), and the bidirectional marks, embeddings,
 * overrides and isolates (U+061C, U+200E/F, U+202A-E, U+2066-9), which can
 * visually reorder a log line.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

/** Default maximum length for untrusted strings stored in metadata. */
export const MAX_METADATA_FRAGMENT_LENGTH = 1024;

/**
 * Removes control characters (including newlines and ANSI escapes) and
 * truncates the string so it can be safely embedded in a message or log line.
 */
export function sanitizeFragment(
  value: unknown,
  maxLength = MAX_MESSAGE_FRAGMENT_LENGTH,
): string {
  const text = typeof value === "string" ? value : safeStringify(value);
  const cleaned = text.replace(CONTROL_CHARS, " ");
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength)}… [truncated ${cleaned.length - maxLength} chars]`;
}

/**
 * Serializes any value to a string without throwing.
 *
 * Handles BigInt, circular structures, symbols, and objects whose
 * `toString` throws. Never returns more than `maxLength` characters.
 */
export function safeStringify(
  value: unknown,
  maxLength = MAX_METADATA_FRAGMENT_LENGTH,
): string {
  let text: string;
  try {
    if (typeof value === "string") {
      text = value;
    } else if (typeof value === "bigint") {
      text = `${value.toString()}n`;
    } else if (typeof value === "symbol") {
      text = value.toString();
    } else if (typeof value === "function") {
      text = `[function ${value.name || "anonymous"}]`;
    } else if (value === undefined) {
      text = "undefined";
    } else {
      // Track the ancestor path, not every object visited: a sub-object
      // shared by two siblings is repeated data, not a cycle.
      const ancestors: unknown[] = [];
      const json = JSON.stringify(
        value,
        function replacer(this: unknown, _key: string, item: unknown) {
          if (typeof item === "bigint") return `${item.toString()}n`;
          if (typeof item === "symbol") return item.toString();
          if (typeof item === "object" && item !== null) {
            while (
              ancestors.length > 0 &&
              ancestors[ancestors.length - 1] !== this
            ) {
              ancestors.pop();
            }
            if (ancestors.includes(item)) return "[Circular]";
            ancestors.push(item);
          }
          return item;
        },
      );
      text = json === undefined ? String(value) : json;
    }
  } catch {
    try {
      text = Object.prototype.toString.call(value);
    } catch {
      text = "[unserializable]";
    }
  }
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

/**
 * Describes a value by type and size without revealing its contents.
 *
 * Use this instead of embedding submitted values into exposed messages.
 */
export function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `array(${value.length})`;
  switch (typeof value) {
    case "string":
      return `string(${value.length})`;
    case "number":
      return Number.isFinite(value) ? "number" : `number(${String(value)})`;
    case "bigint":
      return "bigint";
    case "boolean":
      return `boolean(${String(value)})`;
    case "symbol":
      return "symbol";
    case "function":
      return "function";
    default: {
      if (value instanceof Date) return "date";
      const proto = Object.getPrototypeOf(value) as object | null;
      if (proto === null || proto === Object.prototype) return "object";
      const name = (value as { constructor?: { name?: string } }).constructor
        ?.name;
      return name ? `object(${name})` : "object";
    }
  }
}

/**
 * Produces a message for an unknown thrown value without throwing.
 */
export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return typeof error.message === "string" ? error.message : "Unknown error";
  }
  if (typeof error === "string") return error;
  if (error === null || error === undefined) return "Unknown error";
  const text = safeStringify(error, MAX_MESSAGE_FRAGMENT_LENGTH);
  return text.length > 0 ? text : "Unknown error";
}

/**
 * Asserts that a numeric argument is finite and non-negative.
 */
export function assertFiniteNonNegative(name: string, value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number.`);
  }
  return value;
}

/**
 * Normalizes a retry-after value in seconds to a finite, non-negative integer
 * (rounded up), as required by the HTTP `Retry-After` header.
 */
export function normalizeRetryAfterSeconds(
  value: number,
  name = "retryAfterSeconds",
): number {
  return Math.ceil(assertFiniteNonNegative(name, value));
}

/**
 * Merges caller-provided metadata with class-specific fields, letting the
 * class-specific fields win.
 */
export function mergeMetadata(
  callerMetadata: ErrorMetadata | undefined,
  own: ErrorMetadata,
): ErrorMetadata {
  return { ...(callerMetadata ?? {}), ...own };
}

/**
 * Keys never copied into a redacted issue: assigning an own `__proto__` key
 * (which a JSON round-trip creates) to a plain object replaces its prototype.
 */
const FORBIDDEN_ISSUE_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/** Keys that hold submitted values inside validation/schema issues. */
const VALUE_KEYS = new Set(["value", "received", "input", "actual"]);

/**
 * Removes submitted values from a list of issue objects so they can be
 * exposed to clients or logged. Values are replaced by a type/size
 * description under `<key>Type`; `__proto__`, `constructor` and `prototype`
 * keys are dropped.
 */
export function redactIssueValues<T>(issues: readonly T[]): readonly T[] {
  return issues.map((issue) => {
    if (typeof issue !== "object" || issue === null || Array.isArray(issue)) {
      return issue;
    }
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(issue as Record<string, unknown>)) {
      if (FORBIDDEN_ISSUE_KEYS.has(key)) continue;
      if (VALUE_KEYS.has(key)) {
        out[`${key}Type`] = describeValue(val);
      } else {
        out[key] = val;
      }
    }
    return out as T;
  });
}

/**
 * Converts issue objects into JSON-safe structures (no BigInt, no cycles)
 * so that `JSON.stringify` on the error never throws.
 */
export function toJsonSafeIssues<T>(issues: readonly T[]): readonly T[] {
  return issues.map((issue) => {
    try {
      return JSON.parse(safeStringify(issue, Number.POSITIVE_INFINITY)) as T;
    } catch {
      return issue;
    }
  });
}
