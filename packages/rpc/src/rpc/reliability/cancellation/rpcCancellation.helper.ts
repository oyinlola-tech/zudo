/**
 * @zudojs/rpc/reliability/cancellation
 *
 * Cancellation utilities for RPC operations.
 */

import { RPCCancelledError } from "../../errors/rpc.errors.js";

/**
 * A signal paired with the means to abort it.
 *
 * An `AbortSignal` on its own cannot be aborted — only the controller
 * that owns it can. Returning the pair keeps that capability reachable.
 */
export interface CancellableSignal {
  readonly signal: AbortSignal;
  /** Aborts the signal. Calling it more than once is a no-op. */
  cancel(reason?: unknown): void;
}

/**
 * Creates an AbortSignal that can be triggered manually.
 */
export function createCancellableSignal(): CancellableSignal {
  const controller = new AbortController();

  return {
    signal: controller.signal,
    cancel(reason?: unknown): void {
      if (controller.signal.aborted) {
        return;
      }
      controller.abort(reason ?? new RPCCancelledError());
    },
  };
}

/**
 * Cancels a cancellable signal.
 */
export function cancelSignal(
  cancellable: CancellableSignal,
  reason?: unknown,
): void {
  cancellable.cancel(reason);
}

/**
 * Throws if the signal has been aborted.
 *
 * Use at cooperative cancellation points inside a handler.
 */
export function throwIfCancelled(
  signal: AbortSignal,
  procedureName?: string,
): void {
  if (!signal.aborted) {
    return;
  }

  const reason = signal.reason;
  if (reason instanceof Error) {
    throw reason;
  }

  throw new RPCCancelledError(
    typeof reason === "string" ? reason : undefined,
    procedureName,
  );
}

/**
 * Combines several signals into one that aborts with the first of them.
 *
 * The returned object must be disposed to detach its listeners; leaving
 * them attached would keep every source signal referenced.
 */
export function combineSignals(
  ...signals: readonly (AbortSignal | undefined)[]
): { readonly signal: AbortSignal; dispose(): void } {
  const present = signals.filter(
    (signal): signal is AbortSignal => signal !== undefined,
  );

  const controller = new AbortController();
  const detach: Array<() => void> = [];

  const abort = (reason: unknown): void => {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  };

  for (const source of present) {
    if (source.aborted) {
      abort(source.reason);
      break;
    }

    const listener = (): void => abort(source.reason);
    source.addEventListener("abort", listener, { once: true });
    detach.push(() => source.removeEventListener("abort", listener));
  }

  return {
    signal: controller.signal,
    dispose(): void {
      for (const remove of detach) {
        remove();
      }
      detach.length = 0;
    },
  };
}
