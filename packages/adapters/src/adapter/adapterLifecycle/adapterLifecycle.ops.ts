/**
 * @zudojs/adapters/adapter
 *
 * Bounded execution of one adapter lifecycle hook.
 *
 * `initializeAll()`, `startAll()` and `stopAll()` used to run each hook bare:
 * no timeout, no retry, no abort, and a failure surfaced as whatever the hook
 * threw, so an `AggregateError` from `initializeAll()` never said which
 * adapter had failed. Every hook now runs under the same
 * `AdapterOperationOptions` as `healthAll()`, and a failure is wrapped in the
 * typed error for its operation, naming the adapter and keeping the original
 * as `cause`.
 */

import {
  AdapterDisposeError,
  AdapterError,
  AdapterInitializationError,
  AdapterOperationError,
  AdapterTimeoutError,
} from "@zudojs/errors";

import type { Adapter } from "../adapter.type.js";
import { withRetry } from "../adapter.retry.js";
import type { AdapterOperationOptions } from "../../lifecycle/lifecycle.type.js";

/** The lifecycle hooks of {@link Adapter}. */
export type AdapterLifecycleOperation =
  | "initialize"
  | "start"
  | "stop"
  | "dispose";

type Outcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: unknown };

const OK: Outcome = Object.freeze({ ok: true });

/**
 * Wraps a hook's failure in the typed error for `operation`, naming the
 * adapter. An `AdapterError` — an `AdapterTimeoutError` from the timeout
 * here, or one the adapter threw on purpose — already does, so it passes
 * through unchanged.
 */
export function toAdapterLifecycleError(
  adapter: Adapter,
  operation: AdapterLifecycleOperation,
  error: unknown,
): AdapterError {
  if (error instanceof AdapterError) return error;
  switch (operation) {
    case "initialize":
      return new AdapterInitializationError(adapter.name, error);
    case "dispose":
      return new AdapterDisposeError(adapter.name, error);
    default:
      return new AdapterOperationError(adapter.name, operation, error);
  }
}

/** One attempt at the hook, bounded by `timeout` and `signal`. */
async function attemptOnce(
  adapter: Adapter,
  operation: AdapterLifecycleOperation,
  options: AdapterOperationOptions,
): Promise<Outcome> {
  const abortError = (): Outcome => ({
    ok: false,
    error: new AdapterOperationError(
      adapter.name,
      operation,
      options.signal?.reason,
    ),
  });
  if (options.signal?.aborted) return abortError();

  const hook = adapter[operation];
  if (typeof hook !== "function") return OK;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const guards: Promise<Outcome>[] = [];
  if (options.timeout !== undefined) {
    const timeout = options.timeout;
    guards.push(
      new Promise((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              ok: false,
              error: new AdapterTimeoutError(adapter.name, operation, timeout),
            }),
          timeout,
        );
      }),
    );
  }
  if (options.signal) {
    const signal = options.signal;
    guards.push(
      new Promise((resolve) => {
        onAbort = () => resolve(abortError());
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    );
  }
  try {
    const run = Promise.resolve()
      .then(() => hook.call(adapter))
      .then(
        () => OK,
        (error: unknown): Outcome => ({ ok: false, error }),
      );
    return await Promise.race([run, ...guards]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort) options.signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Runs one lifecycle hook of `adapter` under `options` — `timeout` bounds
 * each try, `retry` re-runs a failed try, `signal` stops the whole thing —
 * and throws the typed error for the operation when the last try failed.
 * An adapter without the hook succeeds immediately.
 *
 * @throws {AdapterInitializationError} when `initialize()` failed.
 * @throws {AdapterOperationError} when `start()` or `stop()` failed, or the
 * signal aborted.
 * @throws {AdapterDisposeError} when `dispose()` failed.
 * @throws {AdapterTimeoutError} when the last try exceeded `timeout`.
 */
export async function runAdapterLifecycle(
  adapter: Adapter,
  operation: AdapterLifecycleOperation,
  options: AdapterOperationOptions = {},
): Promise<void> {
  const outcome = await withRetry(
    () => attemptOnce(adapter, operation, options),
    (result) => result.ok,
    options,
  );
  if (!outcome.ok) {
    throw toAdapterLifecycleError(adapter, operation, outcome.error);
  }
}
