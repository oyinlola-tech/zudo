import type { Logger } from "../../logging/core/logger.js";
import type { RuntimeSignalTarget } from "./runtimeSignals.js";

/** Default grace period for a fatal-error shutdown, in milliseconds. */
export const DEFAULT_FATAL_EXIT_TIMEOUT = 10_000;

/**
 * How a fatal process event (uncaughtException, unhandledRejection)
 * ends the process.
 */
export interface RuntimeFatalExitPolicy {
  /** Exit non-zero once the fatal-error shutdown settles. */
  readonly exitOnFatalError: boolean;
  /** Exit anyway if that shutdown takes longer than this. */
  readonly fatalExitTimeout: number;
  /** Exit code used for a fatal exit. */
  readonly exitCode: number;
}

/**
 * Runs the runtime's fatal-error handler and then ends the process
 * with a non-zero code.
 *
 * Installing an `uncaughtException` listener suppresses Node's own
 * crash, so without an explicit exit the process either ended with
 * code 0 (supervisors saw a clean exit and never restarted or alerted)
 * or lingered as a stopped zombie behind any open handle. The grace
 * timer bounds a shutdown that hangs; both are skipped when
 * `exitOnFatalError` is off.
 */
export function runFatalHandler(
  handler: () => void | Promise<void> | undefined,
  target: RuntimeSignalTarget | undefined,
  policy: RuntimeFatalExitPolicy,
  logger: Logger | undefined,
  event: string,
): void {
  const exit = (): void => {
    if (!policy.exitOnFatalError) return;
    target?.exit?.(policy.exitCode);
  };

  let timer: ReturnType<typeof setTimeout> | undefined;

  if (policy.exitOnFatalError && policy.fatalExitTimeout > 0) {
    timer = setTimeout(() => {
      logger?.error(`Runtime shutdown after ${event} timed out; exiting.`, {
        event,
        timeoutMs: policy.fatalExitTimeout,
      });
      exit();
    }, Math.min(policy.fatalExitTimeout, 2_147_483_647));
    timer.unref?.();
  }

  const finish = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    exit();
  };

  let result: void | Promise<void> | undefined;

  try {
    result = handler();
  } catch (error) {
    logger?.error(`Runtime ${event} handler failed.`, error, { event });
    finish();
    return;
  }

  void Promise.resolve(result)
    .catch((error: unknown) => {
      logger?.error(`Runtime ${event} handler failed.`, error, { event });
    })
    .finally(finish);
}
