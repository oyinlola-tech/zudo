/**
 * Logger transport helper functions.
 */

import type { LoggerEntry } from "../../loggerEntry/loggerEntry.type.js";

import type { LoggerTransportLike } from "../loggerTransport.type.js";

import { isLoggerTransportObject } from "../loggerTransportGuard.js";

import { serializeLoggerValue } from "../../loggerEntry/loggerEntryHelpers/loggerEntryHelpers.valueSerialize.js";

/**
 * Converts a LoggerEntry into a console-friendly object.
 */
export function serializeTransportEntry(
  entry: LoggerEntry,
): Record<string, unknown> {
  return {
    timestamp: entry.timestamp.toISOString(),

    level: entry.levelName,

    message: entry.message,

    ...(entry.logger
      ? {
          logger: entry.logger,
        }
      : {}),

    ...(entry.context
      ? {
          context: serializeLoggerValue(entry.context),
        }
      : {}),

    ...(entry.metadata
      ? {
          metadata: serializeLoggerValue(entry.metadata),
        }
      : {}),

    ...(entry.source
      ? {
          source: serializeLoggerValue(entry.source),
        }
      : {}),

    ...(entry.error
      ? {
          error: {
            name: entry.error.name,

            message: entry.error.message,

            stack: entry.error.stack,
          },
        }
      : {}),
  };
}

/**
 * Renders a record as one line of JSON.
 *
 * Values go through `serializeLoggerValue` first, so a cycle becomes
 * `"[Circular]"`, a BigInt its decimal string and an Error its name,
 * message and stack. `JSON.stringify` escapes `\n`; U+2028 and U+2029,
 * which it leaves raw and some viewers break lines on, are escaped too.
 */
export function toJsonLogLine(record: unknown): string {
  const json = JSON.stringify(serializeLoggerValue(record)) ?? "null";

  return json.replace(/\u2028/gu, "\\u2028").replace(/\u2029/gu, "\\u2029");
}

/**
 * The text a line-oriented transport (console, file, stream) prints for an
 * entry: the formatter's line when there is one, otherwise the entry as a
 * single JSON line.
 */
export function formatTransportLine(entry: LoggerEntry): string {
  return typeof entry.formatted === "string"
    ? entry.formatted
    : toJsonLogLine(serializeTransportEntry(entry));
}

/**
 * Safely closes a transport.
 */
export async function closeLoggerTransport(
  transport: LoggerTransportLike,
): Promise<void> {
  if (isLoggerTransportObject(transport) && transport.close) {
    await transport.close();
  }
}

/**
 * Flushes a transport.
 */
export async function flushLoggerTransport(
  transport: LoggerTransportLike,
): Promise<void> {
  if (isLoggerTransportObject(transport) && transport.flush) {
    await transport.flush();
  }
}
