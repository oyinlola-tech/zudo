import { RuntimeTimeoutError } from "./runtimeError/runtimeError.specialized.js";
import type { RuntimeErrorOptions } from "./runtimeError/runtimeError.type.js";

/**
 * An operation that can be raced against a timeout.
 *
 * The operation receives an AbortSignal that is aborted when the
 * timeout elapses; cooperative operations should stop mutating
 * shared state once `signal.aborted` is true.
 */
export type TimeoutAwareOperation<T> = (signal: AbortSignal) => Promise<T>;

/**
 * Options for {@link withRuntimeTimeout}.
 */
export interface RuntimeTimeoutOptions {
  /**
   * Message used for the timeout error.
   */
  readonly message?: string;

  /**
   * Additional runtime error options for the timeout error.
   */
  readonly error?: RuntimeErrorOptions;

  /**
   * Invoked if the abandoned operation eventually rejects after the
   * timeout already fired. Defaults to swallowing the rejection so it
   * never surfaces as an unhandled rejection.
   */
  readonly onLateRejection?: (error: unknown) => void;
}

/**
 * Runs an operation with a timeout.
 *
 * - `timeoutMs <= 0` disables the timeout.
 * - On timeout the operation's AbortSignal is aborted and a
 *   RuntimeTimeoutError is thrown.
 * - The abandoned operation promise always has a rejection handler
 *   attached, so a late failure can never become an unhandled
 *   rejection.
 */
export async function withRuntimeTimeout<T>(
  operation: TimeoutAwareOperation<T>,
  timeoutMs: number,
  options: RuntimeTimeoutOptions = {},
): Promise<T> {
  const controller = new AbortController();

  if (timeoutMs <= 0) {
    return operation(controller.signal);
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  const pending = operation(controller.signal);

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new RuntimeTimeoutError(
          options.message ??
            `Runtime operation exceeded the configured timeout of ${timeoutMs}ms.`,
          timeoutMs,
          options.error,
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([pending, timeout]);
  } catch (error) {
    if (controller.signal.aborted) {
      pending.catch((lateError: unknown) => {
        options.onLateRejection?.(lateError);
      });
    }
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
