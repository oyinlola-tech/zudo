/**
 * Logger entry value serialization.
 */

import { LOGGER_UNREADABLE_TOKEN } from "./loggerEntryHelpers.sanitize.js";

/**
 * Serializes an error-like object into a plain object.
 */
export function serializeLoggerError(error: {
  name?: string;
  message: string;
  stack?: string;
}): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

/**
 * Converts arbitrary values into safer serializable values.
 *
 * `seen` tracks the ANCESTOR PATH only, so only a genuine back-edge
 * becomes "[Circular]"; `Map` and `Set` keep their contents; and a
 * property whose getter throws becomes "[Unreadable]" rather than
 * taking the whole log line down.
 */
export function serializeLoggerValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet<object>(),
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
    return serializeLoggerError(value);
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
      return value.map((item) => serializeLoggerValue(item, seen));
    }

    if (value instanceof Set) {
      return Array.from(value, (item) => serializeLoggerValue(item, seen));
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
          serializeLoggerValue(item, seen),
        );
      }
      return result;
    }

    for (const key of Object.keys(value)) {
      let item: unknown;
      try {
        item = (value as Record<string, unknown>)[key];
      } catch {
        define(key, LOGGER_UNREADABLE_TOKEN);
        continue;
      }
      define(key, serializeLoggerValue(item, seen));
    }
    return result;
  } finally {
    seen.delete(value);
  }
}
