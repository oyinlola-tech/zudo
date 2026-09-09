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

/**
 * Matches C0 control characters plus DEL — everything that can forge a
 * record boundary or drive a terminal.
 */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/**
 * Replacement token written in place of a redacted value.
 */
export const LOGGER_REDACTION_TOKEN = "[REDACTED]";

/**
 * Field names treated as secrets by default.
 *
 * Matching is case-insensitive and substring-based so `dbPassword`,
 * `X-Api-Key` and `refresh_token` are all covered.
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
   * Field-name pattern. Defaults to DEFAULT_LOGGER_SECRET_PATTERN.
   * Pass a pattern that never matches to rely on `keys` alone.
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
 * other C0 control character and DEL becomes `\xNN`. Ordinary text,
 * including every non-ASCII character, is returned unchanged.
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

  const pattern = options.pattern ?? DEFAULT_LOGGER_SECRET_PATTERN;

  const exact = new Set((options.keys ?? []).map((key) => key.toLowerCase()));

  return (key: string): boolean =>
    exact.has(key.toLowerCase()) || pattern.test(key);
}

/**
 * Recursively replaces secret-named fields with a redaction token.
 *
 * Nesting, arrays and getters are all covered: the walk descends into
 * every enumerable own property, and a getter is read here — once,
 * before the value can reach a transport. Cycles resolve to
 * "[Circular]" rather than recursing forever.
 */
export function redactLogValue(
  value: unknown,
  isSecret: (key: string) => boolean,
  replacement: string = LOGGER_REDACTION_TOKEN,
  seen: WeakSet<object> = new WeakSet<object>(),
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

  if (Array.isArray(value)) {
    return value.map((item) =>
      redactLogValue(item, isSecret, replacement, seen),
    );
  }

  const result: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value)) {
    // defineProperty, never assignment: a "__proto__" key coming from
    // JSON.parse of untrusted input would otherwise reach the inherited
    // setter and replace this object's prototype.
    Object.defineProperty(result, key, {
      value: isSecret(key)
        ? replacement
        : redactLogValue(item, isSecret, replacement, seen),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  return result;
}
