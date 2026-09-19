/**
 * Buffered logger transport.
 */

import type { LoggerEntry } from "../../loggerEntry/loggerEntry.type.js";

import type {
  LoggerBufferedTransportOptions,
  LoggerTransport,
  LoggerTransportLike,
  RegisteredLoggerTransport,
} from "../loggerTransport.type.js";

import {
  createLoggerTransport,
  writeLoggerTransport,
} from "../loggerTransport.core.js";

import {
  closeLoggerTransport,
  flushLoggerTransport,
} from "../loggerTransportHelpers/loggerTransportHelpers.js";

import { throwCollectedFailures } from "../../loggerErrors/loggerError.helpers.js";

/**
 * Creates a transport that buffers entries before forwarding
 * them to another transport.
 */
export function createBufferedLoggerTransport(
  transport: LoggerTransportLike,
  options: LoggerBufferedTransportOptions = {},
): RegisteredLoggerTransport {
  const buffer: LoggerEntry[] = [];
  const maxSize = options.maxSize ?? 100;
  const flushInterval = options.flushInterval ?? 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deferredFailure: { readonly error: unknown } | undefined;

  // Each entry is written on its own: one failing write used to abort the
  // loop after the whole batch had already been spliced out, losing every
  // entry behind it. Only the entries that actually failed are dropped.
  const drain = async (): Promise<void> => {
    if (buffer.length === 0) {
      return;
    }
    const entries = buffer.splice(0, buffer.length);
    const failures: unknown[] = [];
    for (const entry of entries) {
      try {
        await writeLoggerTransport(transport, entry);
      } catch (error) {
        failures.push(error);
      }
    }
    throwCollectedFailures(
      failures,
      `${failures.length} buffered log entries failed to write.`,
    );
  };

  // A failure from a timer-triggered drain has no caller to reach, so it
  // is kept and rethrown by the next explicit flush()/close().
  const takeDeferredFailure = (): unknown[] => {
    if (!deferredFailure) return [];
    const { error } = deferredFailure;
    deferredFailure = undefined;
    return [error];
  };

  const flush = async (): Promise<void> => {
    const failures = takeDeferredFailure();
    try {
      await drain();
    } catch (error) {
      failures.push(error);
    }
    try {
      await flushLoggerTransport(transport);
    } catch (error) {
      failures.push(error);
    }
    throwCollectedFailures(failures, "Buffered logger transport flush failed.");
  };

  const scheduleFlush = (): void => {
    if (flushInterval <= 0 || timer) {
      return;
    }
    timer = setTimeout(async () => {
      timer = undefined;
      try {
        await drain();
      } catch (error) {
        deferredFailure ??= { error };
      }
    }, flushInterval);
    // A pending flush is housekeeping, not work: left referenced it kept a
    // finished process alive for a full `flushInterval`. close() flushes
    // whatever is buffered, so nothing is lost by letting the loop exit.
    timer.unref?.();
  };

  const buffered: LoggerTransport = {
    name: options.name ?? "buffered",
    enabled: options.enabled ?? true,
    async write(entry) {
      buffer.push(entry);
      if (buffer.length >= maxSize) {
        await drain();
      } else {
        scheduleFlush();
      }
    },
    flush,
    async close() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      const failures: unknown[] = [];
      try {
        await flush();
      } catch (error) {
        failures.push(error);
      }
      try {
        await closeLoggerTransport(transport);
      } catch (error) {
        failures.push(error);
      }
      throwCollectedFailures(failures, "Buffered logger transport close failed.");
    },
  };

  return createLoggerTransport(buffered, options);
}
