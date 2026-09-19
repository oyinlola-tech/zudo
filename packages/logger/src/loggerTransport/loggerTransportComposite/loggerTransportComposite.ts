/**
 * Composite logger transports.
 */

import type { LoggerEntry } from "../../loggerEntry/loggerEntry.type.js";

import type {
  LoggerTransportLike,
  LoggerTransportOptions,
  RegisteredLoggerTransport,
} from "../loggerTransport.type.js";

import {
  createLoggerTransport,
  writeLoggerTransport,
} from "../loggerTransport.core.js";

import { createLoggerTransportId } from "../loggerTransportGuard.js";

import {
  closeLoggerTransport,
  flushLoggerTransport,
} from "../loggerTransportHelpers/loggerTransportHelpers.js";

import { settleAllOrThrow } from "../../loggerErrors/loggerError.helpers.js";

import { createBufferedLoggerTransport } from "./loggerTransportComposite.buffered.js";

/**
 * Creates a transport that forwards entries to another
 * transport only when a predicate passes.
 *
 * `flush()` and `close()` are forwarded to the inner transport, so a
 * buffered or file transport nested inside is drained and released by
 * the logger's own `flush()`/`close()`.
 */
export function createConditionalLoggerTransport(
  transport: LoggerTransportLike,
  predicate: (entry: LoggerEntry) => boolean | Promise<boolean>,
  options: LoggerTransportOptions = {},
): RegisteredLoggerTransport {
  return createLoggerTransport(
    {
      name: options.name ?? createLoggerTransportId(),
      enabled: options.enabled ?? true,
      async write(entry, context) {
        if (await predicate(entry)) {
          await writeLoggerTransport(transport, entry, context);
        }
      },
      flush: () => flushLoggerTransport(transport),
      close: () => closeLoggerTransport(transport),
    },
    options,
  );
}

/**
 * Creates a transport that forwards entries to multiple
 * transports.
 *
 * Every sink receives every entry even when another sink throws: writes
 * are settled independently and the failures are rethrown afterwards
 * (one failure as itself, several as an AggregateError). `flush()` and
 * `close()` fan out to every inner transport the same way.
 */
export function createMultiLoggerTransport(
  transports: readonly LoggerTransportLike[],
  options: LoggerTransportOptions = {},
): RegisteredLoggerTransport {
  const sinks = [...transports];

  return createLoggerTransport(
    {
      name: options.name ?? createLoggerTransportId(),
      enabled: options.enabled ?? true,
      write: (entry, context) =>
        settleAllOrThrow(
          sinks.map((sink) => () => writeLoggerTransport(sink, entry, context)),
          "Multiple logger transports failed to write an entry.",
        ),
      flush: () =>
        settleAllOrThrow(
          sinks.map((sink) => () => flushLoggerTransport(sink)),
          "Multiple logger transports failed to flush.",
        ),
      close: () =>
        settleAllOrThrow(
          sinks.map((sink) => () => closeLoggerTransport(sink)),
          "Multiple logger transports failed to close.",
        ),
    },
    options,
  );
}

export { createBufferedLoggerTransport };
