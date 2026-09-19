/**
 * Logger error helper functions.
 */

import {
  LoggerError,
  LoggerTransportError,
  LoggerFormatterError,
} from "./loggerError.base.js";

/** Converts an unknown thrown value into a LoggerError. */
export function toLoggerError(error: unknown, message?: string): LoggerError {
  if (error instanceof LoggerError) return error;
  if (error instanceof Error)
    return new LoggerError(message ?? error.message, "LOGGER_ERROR", {
      cause: error,
    });
  return new LoggerError(message ?? String(error), "LOGGER_ERROR", {
    cause: error,
  });
}

/** Checks whether a value is a LoggerError. */
export function isLoggerError(value: unknown): value is LoggerError {
  return value instanceof LoggerError;
}

/** Safely extracts the cause from an error. */
export function getLoggerErrorCause(error: unknown): unknown {
  if (error instanceof LoggerError) return error.cause;
  if (error instanceof Error && "cause" in error)
    return (error as Error & { cause?: unknown }).cause;
  return undefined;
}

/** Creates a transport error while preserving the original failure. */
export function createLoggerTransportError(
  transportName: string,
  error: unknown,
): LoggerTransportError {
  const cause = error instanceof Error ? error : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return new LoggerTransportError(
    `Logger transport "${transportName}" failed: ${message}`,
    { transportName, cause },
  );
}

/** Creates a formatter error while preserving the original failure. */
export function createLoggerFormatterError(
  formatterName: string,
  error: unknown,
): LoggerFormatterError {
  const cause = error instanceof Error ? error : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return new LoggerFormatterError(
    `Logger formatter "${formatterName}" failed: ${message}`,
    { formatterName, cause },
  );
}

/**
 * Rethrows collected failures: the single failure itself, or an
 * AggregateError when more than one step failed. Does nothing when the
 * list is empty.
 */
export function throwCollectedFailures(
  failures: readonly unknown[],
  message: string,
): void {
  if (failures.length === 0) return;
  if (failures.length === 1) throw failures[0];
  throw new AggregateError(failures, message);
}

/**
 * Runs every step even when earlier ones fail, then rethrows the
 * collected failures via {@link throwCollectedFailures}.
 */
export async function settleAllOrThrow(
  steps: readonly (() => unknown)[],
  message: string,
): Promise<void> {
  const results = await Promise.allSettled(
    steps.map(async (step) => step()),
  );
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason as unknown] : [],
  );
  throwCollectedFailures(failures, message);
}
