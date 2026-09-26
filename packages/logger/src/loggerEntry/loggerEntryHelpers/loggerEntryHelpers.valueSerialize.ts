/**
 * Logger entry value serialization.
 */

import {
  LOGGER_UNREADABLE_TOKEN,
  isLogErrorValue,
} from "./loggerEntryHelpers.sanitize.js";

/**
 * Serializes an error-like object into a plain object.
 *
 * @param includeStack - `false` leaves the stack out (its frames carry
 *   absolute file paths). Defaults to `true`.
 */
export function serializeLoggerError(
  error: {
    name?: string;
    message: string;
    stack?: string;
  },
  includeStack = true,
): Record<string, unknown> {
  return includeStack
    ? { name: error.name, message: error.message, stack: error.stack }
    : { name: error.name, message: error.message };
}

/**
 * Converts arbitrary values into safer serializable values.
 *
 * `seen` tracks the ANCESTOR PATH only, so only a genuine back-edge
 * becomes "[Circular]"; `Map` and `Set` keep their contents; and a
 * property whose getter throws becomes "[Unreadable]" rather than
 * taking the whole log line down. `includeErrorStack: false` leaves the
 * stack out of every Error found in the value.
 */
export function serializeLoggerValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet<object>(),
  includeErrorStack = true,
): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return serializeLoggerError(value, includeErrorStack);
  }
  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }
  if (typeof value === "symbol") {
    return value.toString();
  }
  if (typeof value !== "object") {
    return String(value);
  }
  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) =>
        serializeLoggerValue(item, seen, includeErrorStack),
      );
    }

    if (value instanceof Set) {
      return Array.from(value, (item) =>
        serializeLoggerValue(item, seen, includeErrorStack),
      );
    }

    const result: Record<string, unknown> = {};

    // defineProperty, never assignment: a "__proto__" key from an
    // untrusted payload would otherwise reach the inherited setter and
    // replace the serialized object's prototype.
    const define = (key: string, item: unknown): void => {
      Object.defineProperty(result, key, {
        value: item,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    };

    if (value instanceof Map) {
      for (const [key, item] of value.entries()) {
        define(
          typeof key === "string" ? key : String(key),
          serializeLoggerValue(item, seen, includeErrorStack),
        );
      }
      return result;
    }

    // An Error already normalized by redaction is plain data; honour
    // `includeErrorStack` for it exactly as for a live Error.
    const omitStack = !includeErrorStack && isLogErrorValue(value);
    for (const key of Object.keys(value)) {
      if (omitStack && key === "stack") continue;
      let item: unknown;
      try {
        item = (value as Record<string, unknown>)[key];
      } catch {
        define(key, LOGGER_UNREADABLE_TOKEN);
        continue;
      }
      define(key, serializeLoggerValue(item, seen, includeErrorStack));
    }
    return result;
  } finally {
    seen.delete(value);
  }
}
