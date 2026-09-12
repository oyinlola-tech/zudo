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

import { isLoggerTransportObject } from "../loggerTransportGuard.js";

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

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) {
      return;
    }
    const entries = buffer.splice(0, buffer.length);
    for (const entry of entries) {
      await writeLoggerTransport(transport, entry);
    }
  };

  const scheduleFlush = (): void => {
    if (flushInterval <= 0 || timer) {
      return;
    }
    timer = setTimeout(async () => {
      timer = undefined;
      try {
        await flush();
      } catch {
        /* deliberate no-op */
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
        await flush();
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
      await flush();
      if (isLoggerTransportObject(transport) && transport.close) {
        await transport.close();
      }
    },
  };

  return createLoggerTransport(buffered, options);
}
