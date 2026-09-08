/**
 * @zudojs/http/httpStream — Shared settle-once guard, cleanup, and abort patterns.
 */

export interface StreamSettleGuard {
  readonly settled: () => boolean;
  readonly mark: () => void;
}

export function createSettleGuard(): StreamSettleGuard {
  let settled = false;

  return {
    settled: () => settled,
    mark: () => {
      settled = true;
    },
  };
}

export function cleanupListeners(
  target: NodeJS.ReadableStream | NodeJS.WritableStream,
  listeners: ReadonlyArray<
    readonly [string, (...args: readonly unknown[]) => void]
  >,
): void {
  for (const [event, handler] of listeners) {
    target.removeListener(event, handler);
  }
}

export function wireAbortSignal(
  signal: AbortSignal | undefined,
  onAbort: () => void,
): () => void {
  if (signal) {
    signal.addEventListener("abort", onAbort, { once: true });
  }

  return () => {
    signal?.removeEventListener("abort", onAbort);
  };
}
