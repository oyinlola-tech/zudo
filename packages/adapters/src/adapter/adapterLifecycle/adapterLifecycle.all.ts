/**
 * @zudojs/adapters/adapter
 *
 * Lifecycle operations over a set of adapters: every adapter is attempted
 * and the failures are collected, because stopping at the first one leaves a
 * half-applied transition nobody tracks.
 */

import type { Adapter } from "../adapter.type.js";
import {
  runAdapterLifecycle,
  type AdapterLifecycleOperation,
} from "./adapterLifecycle.ops.js";
import type { AdapterOperationOptions } from "../../lifecycle/lifecycle.type.js";

/**
 * Runs one lifecycle hook on every adapter, in the order given, and throws
 * an `AggregateError` of the typed per-adapter failures once all have been
 * attempted.
 */
export async function runAdapterLifecycleAll(
  adapters: readonly Adapter[],
  operation: AdapterLifecycleOperation,
  options: AdapterOperationOptions,
  message: string,
): Promise<void> {
  const failures: unknown[] = [];
  for (const adapter of adapters) {
    try {
      await runAdapterLifecycle(adapter, operation, options);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, message);
  }
}

/**
 * Stops, then disposes, one adapter, rethrowing the hooks' own errors.
 *
 * `dispose()` runs even when `stop()` throws: by the time this is called the
 * adapter has left the registry, so skipping disposal would orphan its
 * connections and timers with nothing left holding a reference to release
 * them. A `stop()` failure is still reported — on its own when disposal
 * succeeds, alongside the disposal error when both fail.
 *
 * @throws {AggregateError} of the stop and dispose errors when both failed.
 */
export async function teardownAdapter(adapter: Adapter): Promise<void> {
  let stopError: unknown;
  let stopFailed = false;
  try {
    await adapter.stop?.();
  } catch (error) {
    stopFailed = true;
    stopError = error;
  }

  try {
    await adapter.dispose?.();
  } catch (error) {
    if (stopFailed) {
      throw new AggregateError(
        [stopError, error],
        `Adapter "${adapter.name}" failed to stop and to dispose.`,
      );
    }
    throw error;
  }

  if (stopFailed) throw stopError;
}
