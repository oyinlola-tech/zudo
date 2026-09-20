/**
 * JSON logger formatter.
 */

import { serializeLoggerEntry } from "../../loggerEntry/loggerEntrySerialize.js";

import type {
  JsonLoggerFormatterOptions,
  LoggerFormatter,
} from "../loggerFormatter.type.js";

import { createLoggerFormatter } from "../loggerFormatter.core.js";

/**
 * Removes undefined values recursively.
 */
function removeUndefinedValues(
  value: unknown,
  seen: WeakSet<object> = new WeakSet<object>(),
): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
    try {
      return value.map((item) => removeUndefinedValues(item, seen));
    } finally {
      seen.delete(value);
    }
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    // Without a cycle guard this walk recursed until the stack blew,
    // and the resulting RangeError was swallowed by dispatch — losing
    // the log line rather than reporting the offending value. `seen`
    // tracks the ancestor path only (unmarked on ascent), so an object
    // referenced twice in one payload is kept rather than collapsing
    // to "[Circular]" from its second occurrence on.
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);

    try {
      const result: Record<string, unknown> = {};

      for (const [key, item] of Object.entries(value)) {
        if (item === undefined) {
          continue;
        }

        Object.defineProperty(result, key, {
          value: removeUndefinedValues(item, seen),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }

      return result;
    } finally {
      seen.delete(value);
    }
  }

  return value;
}

/**
 * Creates a JSON formatter.
 */
export function createJsonLoggerFormatter(
  options: JsonLoggerFormatterOptions = {},
): LoggerFormatter<string> {
  const pretty = options.pretty ?? false;

  const indent = options.indent ?? 2;

  return createLoggerFormatter(
    (entry) => {
      const serialized = serializeLoggerEntry(entry);

      const normalized = options.includeUndefined
        ? serialized
        : removeUndefinedValues(serialized);

      return JSON.stringify(normalized, null, pretty ? indent : undefined);
    },
    {
      name: options.name ?? "json",
    },
  );
}
