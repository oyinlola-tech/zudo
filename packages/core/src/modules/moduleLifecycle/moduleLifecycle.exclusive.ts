/**
 * Serialises module lifecycle operations, detaching one that was
 * cancelled so teardown never queues behind a hook that may never settle.
 */

interface HeldOperation {
  readonly done: Promise<void>;
  readonly signal: AbortSignal | undefined;
}

/**
 * Resolves when `work` settles or `signal` aborts, whichever is first.
 */
function untilSettledOrAborted(
  work: Promise<void>,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (signal === undefined || signal.aborted) return work;

  return new Promise((resolve) => {
    const done = (): void => {
      signal.removeEventListener("abort", done);
      resolve();
    };
    signal.addEventListener("abort", done, { once: true });
    void work.then(done, done);
  });
}

/**
 * A single-lane lock for lifecycle phases.
 *
 * Phases must not overlap, so each operation waits for the previous
 * one — except an operation whose `signal` has been aborted. That is a
 * bootstrap the startup timeout already gave up on, possibly stuck in a
 * hook that never settles; `stop()`/`destroy()` used to wait behind it
 * for the whole shutdown timeout (30 s by default) after `start()` had
 * long since rejected. Such an operation keeps running detached: it
 * starts no further hook (the phase loop checks the signal), the
 * module it is stuck in stays in its active phase, which teardown
 * skips, and when it finally settles `onDetachedSettled` runs so a
 * module that came up late can still be torn down.
 */
export class ExclusiveOperations {
  private current: HeldOperation | undefined;

  /**
   * Runs `operation` once no other (live) operation is running.
   */
  public async run<T>(
    operation: () => Promise<T>,
    signal?: AbortSignal,
    onDetachedSettled?: () => void,
  ): Promise<T> {
    while (this.current !== undefined && !this.current.signal?.aborted) {
      await untilSettledOrAborted(this.current.done, this.current.signal);
    }

    let release: () => void = () => undefined;
    const held: HeldOperation = {
      done: new Promise<void>((resolve) => {
        release = resolve;
      }),
      signal,
    };
    this.current = held;

    try {
      return await operation();
    } finally {
      const detached = this.current !== held;
      if (!detached) this.current = undefined;
      release();
      if (detached) onDetachedSettled?.();
    }
  }
}
