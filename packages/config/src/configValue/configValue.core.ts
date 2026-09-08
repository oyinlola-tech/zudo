/**
 * Configuration values used throughout Zudojs.
 *
 * This module provides the common value types and utilities used by
 * the configuration system. Values remain JSON-compatible where
 * possible, while allowing common runtime values such as undefined,
 * Date, and Buffer-like binary data to be handled safely.
 */

/**
 * Primitive configuration values.
 */
export type ConfigPrimitive =
  string | number | boolean | bigint | null | undefined;

/**
 * JSON-compatible configuration values.
 */
export type ConfigJsonValue =
  | string
  | number
  | boolean
  | null
  | ConfigJsonValue[]
  | {
      readonly [key: string]: ConfigJsonValue;
    };

/**
 * Values accepted by the Zudojs configuration system.
 */
export type ConfigValue =
  | ConfigPrimitive
  | Date
  | ConfigValue[]
  | {
      readonly [key: string]: ConfigValue;
    };

/**
 * Configuration values after environment-variable parsing.
 */
export type ResolvedConfigValue =
  | string
  | number
  | boolean
  | bigint
  | null
  | undefined
  | Date
  | ResolvedConfigValue[]
  | {
      readonly [key: string]: ResolvedConfigValue;
    };

/**
 * Object keys that must never be copied onto plain objects.
 *
 * Assigning these keys (most notably "__proto__") on a plain object
 * mutates its prototype instead of creating an own property, which
 * enables prototype-pollution attacks via untrusted configuration
 * payloads such as JSON.parse output.
 */
const UNSAFE_CONFIG_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/**
 * Checks whether an object key is unsafe to copy onto plain objects.
 */
export function isUnsafeConfigKey(key: string): boolean {
  return UNSAFE_CONFIG_KEYS.has(key);
}

/**
 * Checks whether a value is a configuration primitive.
 */
export function isConfigPrimitive(value: unknown): value is ConfigPrimitive {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  );
}

/**
 * Checks whether a value is a plain configuration object.
 */
export function isConfigObject(value: unknown): value is {
  readonly [key: string]: ConfigValue;
} {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    value instanceof Date
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

/**
 * Checks whether a value can be stored as a configuration value.
 */
export function isConfigValue(value: unknown): value is ConfigValue {
  if (isConfigPrimitive(value)) {
    return true;
  }

  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }

  if (Array.isArray(value)) {
    return value.every(isConfigValue);
  }

  if (isConfigObject(value)) {
    return Object.values(value).every(isConfigValue);
  }

  return false;
}

/**
 * Converts a configuration value into a JSON-compatible value.
 *
 * Undefined values are preserved by default so callers can decide
 * whether they should be omitted.
 */
export function toConfigJsonValue(
  value: ConfigValue,
): ConfigJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return value;
    }

    return null;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .map(toConfigJsonValue)
      .filter((item): item is ConfigJsonValue => item !== undefined);
  }

  if (isConfigObject(value)) {
    const result: Record<string, ConfigJsonValue> = {};

    for (const [key, child] of Object.entries(value)) {
      const converted = toConfigJsonValue(child);

      if (converted !== undefined) {
        result[key] = converted;
      }
    }

    return result;
  }

  return undefined;
}

/**
 * Converts a configuration value to a string.
 *
 * This is primarily useful when generating environment-like output.
 */
export function configValueToString(value: ConfigValue): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "bigint") {
    return `${value}n`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const json = toConfigJsonValue(value);

  if (json === undefined) {
    return undefined;
  }

  return JSON.stringify(json);
}

/**
 * Parses a primitive environment-style value.
 *
 * The parser intentionally does not aggressively infer numbers or
 * booleans from arbitrary strings. Use the typed config resolvers
 * when a specific type is required.
 */
export function parseConfigString(value: string | undefined): ConfigPrimitive {
  if (value === undefined) {
    return undefined;
  }

  return value;
}

/**
 * Parses a boolean configuration value.
 */
export function parseConfigBoolean(
  value: string | boolean | undefined,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  switch (value.trim().toLowerCase()) {
    case "true":
    case "1":
    case "yes":
    case "y":
    case "on":
      return true;

    case "false":
    case "0":
    case "no":
    case "n":
    case "off":
      return false;

    default:
      return undefined;
  }
}

/**
 * Parses a numeric configuration value.
 */
export function parseConfigNumber(
  value: string | number | undefined,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return undefined;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Parses a bigint configuration value.
 */
export function parseConfigBigInt(
  value: string | bigint | undefined,
): bigint | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "bigint") {
    return value;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return undefined;
  }

  try {
    return BigInt(normalized);
  } catch {
    return undefined;
  }
}

/**
 * Parses a Date configuration value.
 */
export function parseConfigDate(
  value: string | Date | undefined,
): Date | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? undefined
      : new Date(value.getTime());
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Deeply freezes a configuration value.
 *
 * Configuration objects should normally be immutable after
 * resolution to prevent accidental runtime mutation.
 *
 * A shallow-frozen container is still traversed so its nested
 * children are frozen as well. Non-plain objects (class instances)
 * are returned by reference WITHOUT being frozen — consistent with
 * cloneConfigValue, which also returns such values by reference.
 * Values are assumed to be acyclic, as required by ConfigValue.
 */
export function freezeConfigValue<T extends ConfigValue>(value: T): T {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (value instanceof Date) {
    return Object.isFrozen(value) ? value : (Object.freeze(value) as T);
  }

  if (!Array.isArray(value) && !isConfigObject(value)) {
    // Non-plain values (class instances) are intentionally left
    // untouched; they are not valid ConfigValues and callers keep
    // full ownership of them.
    return value;
  }

  for (const child of Object.values(value)) {
    if (typeof child === "object" && child !== null) {
      freezeConfigValue(child as ConfigValue);
    }
  }

  return Object.isFrozen(value) ? value : (Object.freeze(value) as T);
}

/**
 * Deeply clones a configuration value.
 *
 * Plain objects, arrays, and Dates are copied deeply. Non-plain
 * objects (class instances) are returned BY REFERENCE — the clone
 * shares them with the original (freezeConfigValue treats them the
 * same way and never freezes them). Unsafe keys ("__proto__",
 * "constructor", "prototype") are skipped so untrusted payloads
 * cannot pollute prototypes through the clone.
 */
export function cloneConfigValue<T extends ConfigValue>(value: T): T {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (Array.isArray(value)) {
    return value.map(cloneConfigValue) as T;
  }

  if (isConfigObject(value)) {
    const result: Record<string, ConfigValue> = {};

    for (const [key, child] of Object.entries(value)) {
      if (isUnsafeConfigKey(key)) {
        continue;
      }

      result[key] = cloneConfigValue(child);
    }

    return result as T;
  }

  return value;
}

/**
 * Compares two configuration values deeply.
 */
export function configValuesEqual(
  left: ConfigValue,
  right: ConfigValue,
): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => configValuesEqual(value, right[index]));
  }

  if (isConfigObject(left) && isConfigObject(right)) {
    const leftKeys = Object.keys(left);

    const rightKeys = Object.keys(right);

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    return leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        configValuesEqual(left[key], right[key]),
    );
  }

  return false;
}
