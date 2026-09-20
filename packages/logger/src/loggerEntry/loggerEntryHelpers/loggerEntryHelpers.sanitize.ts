/**
 * Log text sanitization and secret redaction.
 *
 * Log records routinely carry attacker-controlled strings (a username,
 * a URL, an error message echoing request input). Written verbatim to a
 * line-oriented sink, a single newline lets that input FORGE a complete
 * additional log line, and an ESC byte lets it drive the operator's
 * terminal. Every string that reaches a text-shaped formatter is
 * therefore escaped here first.
 */

import { createDefaultSecretFieldMatcher } from "../loggerEntry.secretFields.js";

/**
 * Matches C0 controls, DEL, C1 controls (NEL, CSI) and the Unicode
 * line/paragraph separators — everything that can forge a record
 * boundary or drive a terminal.
 */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

/**
 * Replacement token written in place of a redacted value.
 */
export const LOGGER_REDACTION_TOKEN = "[REDACTED]";

/**
 * Replacement token written in place of a property whose getter threw.
 *
 * A throwing accessor used to propagate out of `logger.info(...)` and
 * abort the caller. The field is marked instead, the rest of the entry
 * is logged, and the failure is reported as an infrastructure error.
 */
export const LOGGER_UNREADABLE_TOKEN = "[Unreadable]";

/**
 * Legacy substring pattern for secret field names.
 *
 * @deprecated No longer the default: it redacted `passenger`/`compass`
 * and missed `auth`, `sessionId`, `ssn`, `cardNumber`, `cvv` and `otp`.
 * The default is now the word-based matcher over
 * `DEFAULT_LOGGER_SECRET_FIELDS`. Pass this as `redact.pattern` to opt
 * back into the old behaviour.
 */
export const DEFAULT_LOGGER_SECRET_PATTERN =
  /(pass(word|wd)?|secret|token|api[-_.]?key|private[-_.]?key|credential|authorization|cookie)/i;

/**
 * Controls secret redaction for a logger.
 */
export interface LoggerRedactionOptions {
  /**
   * Whether redaction runs at all. Defaults to true.
   */
  readonly enabled?: boolean;

  /**
   * Exact field names to redact, in addition to `pattern`.
   */
  readonly keys?: readonly string[];

  /**
   * Field-name pattern. When omitted, the word-based default matcher over
   * `DEFAULT_LOGGER_SECRET_FIELDS` is used. Pass a pattern that never
   * matches to rely on `keys` alone.
   */
  readonly pattern?: RegExp;

  /**
   * Replacement written in place of a secret.
   */
  readonly replacement?: string;
}

/**
 * Escapes control characters that could forge log records.
 *
 * CR, LF, TAB and the ANSI escape byte become printable escapes; every
 * other C0/C1 control character and DEL becomes `\xNN`, and U+2028 /
 * U+2029 become `\u2028` / `\u2029`. All other text is unchanged.
 */
export function escapeLogText(value: string): string {
  return value.replace(CONTROL_CHARACTERS, (character) => {
    switch (character) {
      case "\n":
        return "\\n";
      case "\r":
        return "\\r";
      case "\t":
        return "\\t";
      case "\u001b":
        return "\\u001b";
      case "\u2028":
        return "\\u2028";
      case "\u2029":
        return "\\u2029";
      default: {
        const code = character.charCodeAt(0);
        return `\\x${code.toString(16).padStart(2, "0")}`;
      }
    }
  });
}

/**
 * Returns whether a string contains characters that can forge a record.
 */
export function hasLogControlCharacters(value: string): boolean {
  return new RegExp(CONTROL_CHARACTERS.source).test(value);
}

/**
 * Builds a predicate deciding whether a field name holds a secret.
 */
export function createSecretMatcher(
  options: LoggerRedactionOptions = {},
): (key: string) => boolean {
  if (options.enabled === false) {
    return () => false;
  }

  const exact = new Set((options.keys ?? []).map((key) => key.toLowerCase()));
  const configured = options.pattern;

  if (configured === undefined) {
    const isDefaultSecret = createDefaultSecretFieldMatcher();
    return (key: string): boolean =>
      exact.has(key.toLowerCase()) || isDefaultSecret(key);
  }

  // Copy the pattern without `g`/`y`: those flags make `test()` advance
  // `lastIndex`, so a shared pattern would match a secret-named field on
  // one entry and let it through unredacted on the next.
  const pattern =
    configured.global || configured.sticky
      ? new RegExp(configured.source, configured.flags.replace(/[gy]/gu, ""))
      : configured;

  return (key: string): boolean =>
    exact.has(key.toLowerCase()) || pattern.test(key);
}

/** Defines an own, enumerable property without touching a setter. */
function defineLogProperty(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  // defineProperty, never assignment: a "__proto__" key coming from
  // JSON.parse of untrusted input would otherwise reach the inherited
  // setter and replace this object's prototype.
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/**
 * Recursively replaces secret-named fields with a redaction token.
 *
 * Nesting, arrays, `Map`, `Set` and getters are all covered: the walk
 * descends into every enumerable own property, and a getter is read
 * here — once, before the value can reach a transport. A getter that
 * throws yields {@link LOGGER_UNREADABLE_TOKEN} and is reported through
 * `onReadError` instead of aborting the caller's log statement.
 *
 * `seen` tracks the ANCESTOR PATH only (each object is unmarked as the
 * walk ascends), so a back-edge resolves to "[Circular]" while an
 * object merely referenced twice in one payload is logged both times.
 */
export function redactLogValue(
  value: unknown,
  isSecret: (key: string) => boolean,
  replacement: string = LOGGER_REDACTION_TOKEN,
  seen: WeakSet<object> = new WeakSet<object>(),
  onReadError?: (key: string, error: unknown) => void,
): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date || value instanceof Error) {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  try {
    const descend = (item: unknown): unknown =>
      redactLogValue(item, isSecret, replacement, seen, onReadError);

    if (Array.isArray(value)) {
      return value.map(descend);
    }

    if (value instanceof Set) {
      return Array.from(value, descend);
    }

    const result: Record<string, unknown> = {};

    if (value instanceof Map) {
      for (const [key, item] of value.entries()) {
        const name = typeof key === "string" ? key : String(key);
        defineLogProperty(
          result,
          name,
          isSecret(name) ? replacement : descend(item),
        );
      }

      return result;
    }

    for (const key of Object.keys(value)) {
      if (isSecret(key)) {
        // Never even read a secret-named accessor.
        defineLogProperty(result, key, replacement);
        continue;
      }

      let item: unknown;

      try {
        item = (value as Record<string, unknown>)[key];
      } catch (error) {
        onReadError?.(key, error);
        defineLogProperty(result, key, LOGGER_UNREADABLE_TOKEN);
        continue;
      }

      defineLogProperty(result, key, descend(item));
    }

    return result;
  } finally {
    seen.delete(value);
  }
}
