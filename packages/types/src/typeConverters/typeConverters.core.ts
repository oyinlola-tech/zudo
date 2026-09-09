/**
 * Runtime type conversion helpers.
 *
 * @module typeConverters/typeConverters
 */

/** Property names that mutate a prototype instead of adding a key. */
const UNSAFE_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/**
 * Safely parse JSON with a fallback value.
 *
 * "Safe" here means only that malformed JSON yields the fallback rather than
 * throwing. The result is cast to `T` without validation — parse a trust
 * boundary with `@zudojs/validation` or `@zudojs/schema` instead of relying on
 * this cast.
 *
 * Keys that would reach a prototype are dropped, so the parsed value cannot
 * seed a pollution chain downstream.
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json, function reviver(key, value) {
      if (UNSAFE_KEYS.has(key)) return undefined;
      return value as unknown;
    }) as T;
  } catch {
    return fallback;
  }
}

/**
 * Convert a value to a string safely.
 *
 * Always returns a string. `JSON.stringify` returns the *value* `undefined`
 * — not a string, and without throwing — for functions, symbols and
 * `undefined`, so its result is checked rather than returned directly.
 */
export function toString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "bigint") return `${value}`;
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") return fallback;

  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Convert a value to a finite number safely.
 *
 * Blank strings, hexadecimal literals and infinities all fall back rather than
 * converting: a missing query parameter arriving as `""` becoming a real zero
 * silently turns into a page size, a price or a limit.
 */
export function toNumber(value: unknown, fallback = NaN): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return fallback;
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/u.test(trimmed)) {
      return fallback;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

/**
 * Convert a value to a boolean safely.
 *
 * `NaN` falls back rather than converting to true. It is what `toNumber`
 * produces on failure, so chaining the two would otherwise turn a parse
 * failure into the permissive answer for a flag.
 */
export function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    if (lower === "true" || lower === "1" || lower === "yes" || lower === "on")
      return true;
    if (
      lower === "false" ||
      lower === "0" ||
      lower === "no" ||
      lower === "off" ||
      lower === ""
    )
      return false;
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isNaN(value) ? fallback : value !== 0;
  }

  return fallback;
}

/**
 * Convert a value to an array (wrapping non-arrays).
 */
export function toArray<T>(value: T | T[]): T[] {
  if (Array.isArray(value)) return value;
  return [value];
}

/**
 * Convert a Map to a plain object.
 *
 * Built on a null-prototype object with `defineProperty`. Assigning into an
 * object literal routes a `__proto__` key through the prototype setter, so a
 * Map built from request data — headers, form fields, query parameters — could
 * replace the result's prototype with attacker-supplied values that
 * `Object.keys` does not reveal.
 */
export function mapToObject<K extends string | number | symbol, V>(
  map: Map<K, V>,
): Record<K, V> {
  const obj = Object.create(null) as Record<K, V>;

  for (const [key, value] of map) {
    Object.defineProperty(obj, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  return obj;
}

/**
 * Convert a plain object to a Map.
 */
export function objectToMap<K extends string | number | symbol, V>(
  obj: Record<K, V>,
): Map<K, V> {
  return new Map(Object.entries(obj) as [K, V][]);
}

/**
 * Convert snake_case to camelCase.
 */
export function snakeToCamel(str: string): string {
  return str.replace(/(?<!_)_+([a-z0-9])/gu, (_, char: string) => char.toUpperCase());
}

/**
 * Split a camelCase or PascalCase identifier into its words.
 *
 * Runs of capitals are kept together, so `parseHTTPResponse` yields
 * `["parse", "HTTP", "Response"]` rather than one word per letter.
 */
function splitCamelWords(str: string): string[] {
  return str.match(/(?:[A-Z](?![a-z]))+|[A-Z]?[a-z0-9]+|[A-Z]|[0-9]+/gu) ?? [];
}

/**
 * Convert camelCase or PascalCase to snake_case.
 *
 * Leading capitals do not produce a leading separator, and acronyms survive
 * as single words — an identifier like `_hello_world` is not a valid column
 * name, and `parse_h_t_t_p_response` is not a useful one.
 */
export function camelToSnake(str: string): string {
  return splitCamelWords(str)
    .map((word) => word.toLowerCase())
    .join("_");
}

/**
 * Convert kebab-case to camelCase.
 */
export function kebabToCamel(str: string): string {
  return str.replace(/(?<!-)-+([a-z0-9])/gu, (_, char: string) => char.toUpperCase());
}

/**
 * Convert camelCase or PascalCase to kebab-case.
 */
export function camelToKebab(str: string): string {
  return splitCamelWords(str)
    .map((word) => word.toLowerCase())
    .join("-");
}
