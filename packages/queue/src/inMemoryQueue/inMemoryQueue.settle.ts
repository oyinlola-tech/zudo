/**
 * Waiting for a timed-out processor to actually stop.
 *
 * The timeout middleware rejects as soon as the timer fires, but the
 * processor promise it raced keeps running until it notices the aborted
 * signal. Freeing the concurrency slot and scheduling the retry at that
 * moment let the retry run beside the original attempt.
 *
 * @module inMemoryQueue/inMemoryQueue.settle
 */

/** Default grace for a timed-out processor to settle, in milliseconds. */
export const DEFAULT_TIMEOUT_GRACE_MS = 5_000;

/**
 * Resolves once `pending` settles or `graceMs` elapses, whichever is first.
 *
 * Never rejects: the processor's own outcome has already been superseded by
 * the failure being handled.
 *
 * @param pending - The processor promise, if the processor was started.
 * @param graceMs - The longest to wait.
 * @returns True when the processor settled within the grace period.
 */
export async function settleWithin(
  pending: Promise<unknown> | undefined,
  graceMs: number,
): Promise<boolean> {
  if (pending === undefined) return true;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const settled = pending.then(
    () => true,
    () => true,
  );
  const expired = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), Math.max(0, graceMs));
  });

  try {
    return await Promise.race([settled, expired]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
