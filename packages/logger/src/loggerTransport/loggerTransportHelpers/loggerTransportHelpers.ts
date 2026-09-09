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
