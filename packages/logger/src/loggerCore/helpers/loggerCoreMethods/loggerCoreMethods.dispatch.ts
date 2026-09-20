/**
 * Logger entry dispatch to transports.
 */

import type { LoggerEntry } from "../../../loggerEntry/loggerEntry.type.js";

import { formatLoggerEntry } from "../../../loggerFormatter/loggerFormatter.core.js";

import {
  createLoggerTransport,
  writeLoggerTransport,
} from "../../../loggerTransport/loggerTransport.core.js";

import { isLoggerTransport } from "../../../loggerTransport/loggerTransportGuard.js";

import {
  LoggerFormatterError,
  LoggerTimeoutError,
  LoggerTransportError,
} from "../../../loggerErrors/loggerError.base.js";
import {
  createLoggerFormatterError,
  createLoggerTransportError,
} from "../../../loggerErrors/loggerError.helpers.js";

import type { LoggerConfiguration } from "../../../loggerOptions/loggerOptions.type.js";

/**
 * Default formatter used when no formatter is configured.
 */
import { createTextLoggerFormatter } from "../../../loggerFormatter/loggerFormatterFormatters/loggerFormatterFormatters.text.js";

function defaultFormat(
  configuration: LoggerConfiguration,
  entry: LoggerEntry,
): string {
  return createTextLoggerFormatter({
    name: "default",
  }).format(entry, {
    loggerName: configuration.name,
    environment: configuration.environment,
  });
}

/**
 * Bounds a transport write with the configured transport timeout.
 *
 * `transportTimeout` was accepted, validated and stored but never read,
 * so a transport whose write() never settled blocked flush() and
 * close() forever. A non-positive timeout disables the bound.
 */
async function withTransportTimeout(
  timeoutMs: number,
  transportName: string,
  operation: Promise<void>,
): Promise<void> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    await operation;
    return;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      // LoggerTimeoutError carries `transportName` and `timeout`, which
      // the bare LoggerTransportError raised here before did not — so
      // `catch (e) { if (e instanceof LoggerTimeoutError) retry() }`
      // could never match.
      reject(new LoggerTimeoutError(transportName, timeoutMs));
    }, timeoutMs);

    // This timer bounds a write; it is not work in its own right. Left
    // referenced it keeps the event loop alive, so a process that has
    // finished but logged through an async transport hangs until the
    // timeout elapses. Every other timer in the framework is unref'd
    // for the same reason.
    timer.unref?.();
  });

  try {
    await Promise.race([operation, expiry]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    // The abandoned write must never surface as an unhandled rejection.
    void operation.catch(() => {});
  }
}

/**
 * Builds the payload handed to a transport.
 *
 * `LoggerFormattedOutput` is `string | Record<string, unknown>`. A
 * string replaces the message; an OBJECT is the formatted record and is
 * merged over the entry, so a transport sees the formatter's fields.
 * The object branch used to be computed and then discarded, which made
 * `createStructuredLoggerFormatter()` pure overhead on every log call
 * and handed the transport the raw, unformatted entry instead.
 */
function toTransportPayload(
  entry: LoggerEntry,
  formatted: unknown,
): LoggerEntry {
  if (typeof formatted === "string") {
    return { ...entry, message: formatted };
  }

  if (
    formatted !== null &&
    typeof formatted === "object" &&
    !Array.isArray(formatted)
  ) {
    return {
      ...entry,
      ...(formatted as Record<string, unknown>),
    } as unknown as LoggerEntry;
  }

  return entry;
}

/** Name of the configured formatter, for error reporting. */
function resolveFormatterName(configuration: LoggerConfiguration): string {
  const formatter = configuration.formatter;

  if (typeof formatter === "string") {
    return formatter;
  }

  return (formatter as { readonly name?: string }).name ?? "formatter";
}

/** Wraps a transport failure, keeping an already-typed logger error. */
function toTransportError(
  transportName: string,
  error: unknown,
): LoggerTransportError {
  return error instanceof LoggerTransportError
    ? error
    : createLoggerTransportError(transportName, error);
}

/** Wraps a formatter failure, keeping an already-typed logger error. */
function toFormatterError(
  formatterName: string,
  error: unknown,
): LoggerFormatterError {
  return error instanceof LoggerFormatterError
    ? error
    : createLoggerFormatterError(formatterName, error);
}

/**
 * Writes to a transport.
 */
async function writeTransport(
  configuration: LoggerConfiguration,
  transport: ReturnType<typeof createLoggerTransport>,
  entry: LoggerEntry,
  formatted: unknown,
): Promise<void> {
  const transportContext = {
    loggerName: configuration.name,
    environment: configuration.environment,
  };

  await writeLoggerTransport(
    transport.transport,
    toTransportPayload(entry, formatted),
    transportContext,
  );
}

/**
 * Formats an entry with the configured formatter.
 */
function formatEntry(
  configuration: LoggerConfiguration,
  entry: LoggerEntry,
): unknown {
  const formatter = configuration.formatter;

  if (typeof formatter === "string") {
    return defaultFormat(configuration, entry);
  }

  return formatLoggerEntry(formatter, entry, {
    loggerName: configuration.name,
    environment: configuration.environment,
  });
}

/**
 * Writes an entry through one transport WITHOUT forcing a microtask.
 *
 * `writeLoggerTransport` is `async`, so awaiting it always defers by at
 * least one microtask even for a fully synchronous transport. Calling
 * the transport directly lets a synchronous console/array transport
 * complete inline, which is what `asynchronous: false` promises.
 */
function writeTransportMaybeSync(
  configuration: LoggerConfiguration,
  transport: ReturnType<typeof createLoggerTransport>,
  entry: LoggerEntry,
  formatted: unknown,
): void | Promise<void> {
  const transportContext = {
    loggerName: configuration.name,
    environment: configuration.environment,
  };

  const payload = toTransportPayload(entry, formatted);

  const target = transport.transport;

  return typeof target === "function"
    ? target(payload, transportContext)
    : target.write(payload, transportContext);
}

/**
 * Dispatches an entry to the configured transports.
 */
export async function dispatchEntry(
  configuration: LoggerConfiguration,
  entry: LoggerEntry,
  handleError: (error: Error) => void,
): Promise<void> {
  let formatted: unknown;

  try {
    formatted = formatEntry(configuration, entry);
  } catch (error) {
    handleError(toFormatterError(resolveFormatterName(configuration), error));
    return;
  }

  for (const transport of configuration.transports) {
    let transportName = "transport";

    try {
      if (!isLoggerTransport(transport)) {
        continue;
      }

      const registered = createLoggerTransport(transport);
      transportName = registered.name;

      if (!registered.enabled) {
        continue;
      }

      await withTransportTimeout(
        configuration.transportTimeout,
        registered.name,
        writeTransport(configuration, registered, entry, formatted),
      );
    } catch (error) {
      handleError(toTransportError(transportName, error));
    }
  }
}

/**
 * Dispatches an entry, completing synchronously where it can.
 *
 * Returns `undefined` when every configured transport finished
 * synchronously (nothing to await), otherwise a promise covering the
 * asynchronous remainder. `asynchronous: true` skips the fast path
 * entirely and always defers, keeping the caller off the transport's
 * critical path — the option was previously stored and never read, so
 * both settings behaved identically.
 */
export function dispatchEntrySync(
  configuration: LoggerConfiguration,
  entry: LoggerEntry,
  handleError: (error: Error) => void,
): void | Promise<void> {
  if (configuration.asynchronous) {
    // `dispatchEntry` runs synchronously up to its first await, so a
    // synchronous transport would still execute inline. Hop a
    // microtask first so `asynchronous: true` genuinely keeps the
    // caller off the transport's critical path.
    return Promise.resolve().then(() =>
      dispatchEntry(configuration, entry, handleError),
    );
  }

  let formatted: unknown;

  try {
    formatted = formatEntry(configuration, entry);
  } catch (error) {
    handleError(toFormatterError(resolveFormatterName(configuration), error));
    return;
  }

  const pending: Promise<void>[] = [];

  for (const transport of configuration.transports) {
    let transportName = "transport";

    try {
      if (!isLoggerTransport(transport)) {
        continue;
      }

      const registered = createLoggerTransport(transport);
      transportName = registered.name;

      if (!registered.enabled) {
        continue;
      }

      const result = writeTransportMaybeSync(
        configuration,
        registered,
        entry,
        formatted,
      );

      if (result instanceof Promise) {
        pending.push(
          withTransportTimeout(
            configuration.transportTimeout,
            registered.name,
            result,
          ).catch((error: unknown) => {
            handleError(toTransportError(registered.name, error));
          }),
        );
      }
    } catch (error) {
      handleError(toTransportError(transportName, error));
    }
  }

  if (pending.length === 0) {
    return;
  }

  return Promise.all(pending).then(() => undefined);
}
