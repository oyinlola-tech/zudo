/**
 * @zudojs/security — Input Sanitization
 *
 * Sanitizes user input against common attack patterns.
 */

import type { InputSanitizationConfig } from "../types/security.type.js";
import {
  PROTOTYPE_POLLUTION_KEYS,
  SQL_INJECTION_PATTERNS,
  XSS_PATTERNS,
} from "../types/security.type.js";

/**
 * Null byte and control character patterns.
 *
 * Two variants of each: the plain form is used with {@link RegExp.test}, the
 * `g` form only with {@link String.replace}. A global regex keeps `lastIndex`
 * between `test` calls and resumes from there on the next one, so sharing a
 * single `/g` pattern across both uses makes the test report `false` for input
 * it matched moments earlier.
 */
const NULL_BYTE_PATTERN = /\x00/;
const NULL_BYTE_PATTERN_GLOBAL = /\x00/g;

/** Control characters, excluding tab, newline, and carriage return. */
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const CONTROL_CHAR_PATTERN_GLOBAL = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/** Default maximum recursion depth for {@link sanitizeObject}. */
const DEFAULT_MAX_DEPTH = 32;

/**
 * Checks if a string contains SQL injection patterns.
 *
 * A heuristic with a high false-positive rate on ordinary prose — never the
 * only defence against injection. Parameterise your queries.
 *
 * @param input - The string to check.
 * @returns True if SQL injection patterns are detected.
 */
export function containsSqlInjection(input: string): boolean {
  return SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * Checks if a string contains XSS patterns.
 *
 * @param input - The string to check.
 * @returns True if XSS patterns are detected.
 */
export function containsXss(input: string): boolean {
  return XSS_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * Checks if a string contains prototype pollution keys.
 *
 * @param input - The string to check.
 * @returns True if prototype pollution keys are detected.
 */
export function containsPrototypePollution(input: string): boolean {
  return PROTOTYPE_POLLUTION_KEYS.includes(
    input as (typeof PROTOTYPE_POLLUTION_KEYS)[number],
  );
}

/**
 * Sanitizes a string by removing dangerous characters.
 *
 * @param input - The string to sanitize.
 * @param config - Optional sanitization configuration.
 * @returns The sanitized string.
 */
export function sanitizeString(
  input: string,
  config?: InputSanitizationConfig,
): string {
  let sanitized = input;

  // Strip null bytes
  if (config?.stripNullBytes !== false) {
    sanitized = sanitized.replace(NULL_BYTE_PATTERN_GLOBAL, "");
  }

  // Strip control characters
  sanitized = sanitized.replace(CONTROL_CHAR_PATTERN_GLOBAL, "");

  // Normalize Unicode — collapses visually identical sequences so that
  // downstream comparisons and length checks see one canonical form.
  if (config?.normalizeUnicode) {
    sanitized = sanitized.normalize("NFC");
  }

  // Truncate if max length configured
  if (config?.maxStringLength && sanitized.length > config.maxStringLength) {
    sanitized = sanitized.slice(0, config.maxStringLength);
  }

  // Custom sanitizer
  if (config?.customSanitizer) {
    sanitized = config.customSanitizer(sanitized);
  }

  return sanitized;
}

/**
 * Sanitizes a value of any shape, recursing into arrays and plain objects.
 *
 * Arrays stay arrays at every level, cycles are detected and replaced with
 * `undefined` rather than overflowing the stack, and recursion stops at
 * `config.maxDepth`.
 */
function sanitizeValue(
  value: unknown,
  config: InputSanitizationConfig | undefined,
  seen: WeakSet<object>,
  depth: number,
  maxDepth: number,
): unknown {
  if (typeof value === "string") {
    return sanitizeString(value, config);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (depth >= maxDepth) {
    return undefined;
  }

  // A repeat visit means a cycle: recursing would never terminate.
  if (seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) =>
        sanitizeValue(item, config, seen, depth + 1, maxDepth),
      );
    }

    // Anything with its own semantics (Date, Map, RegExp, class instances) is
    // passed through untouched — spreading it would silently turn it into a
    // plain object and lose that behaviour.
    if (!isPlainObject(value)) {
      return value;
    }

    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (
        config?.preventPrototypePollution !== false &&
        containsPrototypePollution(key)
      ) {
        continue;
      }
      // `result[key] = …` does not create an own property for `__proto__`:
      // it calls the inherited setter and replaces the result's prototype, so
      // the attacker's fields resolve on the returned object while
      // `Object.keys` shows nothing. That is exactly what happened whenever a
      // caller set `preventPrototypePollution: false`, which is documented as
      // "keep these keys as data", not "let them reassign a prototype".
      // `defineProperty` always creates a real own property.
      Object.defineProperty(result, key, {
        value: sanitizeValue(child, config, seen, depth + 1, maxDepth),
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    return result;
  } finally {
    // Leaving this branch: a sibling may legitimately reference the same
    // object without that being a cycle.
    seen.delete(value);
  }
}

/** True when the value is a plain object (`{}` or `Object.create(null)`). */
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === null || proto === Object.prototype;
}

/**
 * Sanitizes an object by recursively cleaning its values.
 *
 * Cycles and over-deep structures are handled: a repeated reference or a
 * branch past `config.maxDepth` (default 32) becomes `undefined` instead of
 * exhausting the stack.
 *
 * @param obj - The object to sanitize.
 * @param config - Optional sanitization configuration.
 * @returns The sanitized object.
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  config?: InputSanitizationConfig,
): T {
  const maxDepth = config?.maxDepth ?? DEFAULT_MAX_DEPTH;
  return sanitizeValue(obj, config, new WeakSet(), 0, maxDepth) as T;
}

/**
 * Validates that a string contains only safe characters.
 *
 * @param input - The string to validate.
 * @param allowedPattern - Optional regex pattern for allowed characters.
 * @returns True if the string is safe.
 */
export function isSafeString(input: string, allowedPattern?: RegExp): boolean {
  // Check for null bytes
  if (NULL_BYTE_PATTERN.test(input)) {
    return false;
  }

  // Check for control characters
  if (CONTROL_CHAR_PATTERN.test(input)) {
    return false;
  }

  // Check custom pattern. A caller-supplied `g`/`y` regex carries `lastIndex`
  // between calls, so it is normalised before use.
  if (allowedPattern && !withoutStickyFlags(allowedPattern).test(input)) {
    return false;
  }

  return true;
}

/**
 * Returns an equivalent regex with the `g` and `y` flags removed.
 *
 * Both flags make `test` stateful via `lastIndex`; for a one-shot boolean
 * check they only introduce order-dependent results.
 */
export function withoutStickyFlags(pattern: RegExp): RegExp {
  const flags = pattern.flags.replace(/[gy]/g, "");
  return flags === pattern.flags ? pattern : new RegExp(pattern.source, flags);
}

/**
 * Checks for common attack patterns in a string.
 *
 * @param input - The string to check.
 * @returns An array of detected threats.
 */
export function detectThreats(input: string): string[] {
  const threats: string[] = [];

  if (containsSqlInjection(input)) {
    threats.push("SQL_INJECTION");
  }

  if (containsXss(input)) {
    threats.push("XSS");
  }

  if (NULL_BYTE_PATTERN.test(input)) {
    threats.push("NULL_BYTE");
  }

  if (CONTROL_CHAR_PATTERN.test(input)) {
    threats.push("CONTROL_CHARACTERS");
  }

  return threats;
}

/**
 * HTML-escapes a string to prevent XSS.
 *
 * Escapes the five characters that matter in element text and quoted attribute
 * values. It does not make a string safe for an unquoted attribute, inside a
 * `<script>` or `<style>` block, or in a URL position — those contexts need
 * their own encoding.
 *
 * @param input - The string to escape.
 * @returns The escaped string.
 */
export function escapeHtml(input: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "`": "&#96;",
  };

  return input.replace(/[&<>"'`]/g, (char) => map[char] ?? char);
}

/**
 * Strips HTML tags from a string.
 *
 * This removes tag syntax; it is **not** an HTML sanitizer. The result is safe
 * to treat as plain text, but must still be escaped with {@link escapeHtml}
 * before being inserted back into a document — use a dedicated sanitizer if
 * you need to keep markup.
 *
 * An unterminated `<` consumes the remainder of the input, which is the safe
 * direction: a truncated tag never survives into the output.
 *
 * @param input - The string to strip.
 * @returns The string with HTML tags removed.
 */
export function stripHtml(input: string): string {
  let result = "";
  let inTag = false;

  for (const char of input) {
    if (char === "<") {
      inTag = true;
    } else if (char === ">") {
      inTag = false;
    } else if (!inTag) {
      result += char;
    }
  }

  return result;
}
