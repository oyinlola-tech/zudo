import type { ReadinessCheck, ReadinessCheckFn } from "./readiness.type.js";

/**
 * How long a single readiness check may run before it counts as failed.
 *
 * Without a bound, one hanging probe hangs the readiness endpoint
 * indefinitely — a health check that never answers is worse than one
 * that answers "unhealthy".
 */
export const DEFAULT_CHECK_TIMEOUT = 5_000;

/**
 * Runs a check under a timeout, clearing the timer either way.
 *
 * The timer is deliberately NOT `unref`'d. It is cleared as soon as the
 * check settles, so it never outlives a healthy check; while a check
 * hangs it is the only thing guaranteeing an answer. Unref'd, a short
 * script that awaited `runChecks()` on a hanging check exited with
 * "unsettled top-level await" (code 13) instead of recording a timeout.
 */
export async function runCheckWithTimeout(
  name: string,
  fn: ReadinessCheckFn,
  timeoutMs: number,
): Promise<boolean> {
  if (timeoutMs <= 0) {
    return fn();
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve(fn()),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `Readiness check "${name}" did not settle within ${timeoutMs}ms.`,
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Evaluates one check and produces the result to record for it.
 *
 * A check that returns `false` used to be recorded with no message at
 * all, indistinguishable from one that was never run.
 */
export async function evaluateReadinessCheck(
  name: string,
  fn: ReadinessCheckFn,
  timeoutMs: number,
  critical: boolean,
): Promise<ReadinessCheck> {
  const startedAt = Date.now();

  try {
    const ready = await runCheckWithTimeout(name, fn, timeoutMs);

    return {
      name,
      ready,
      critical,
      lastCheckedAt: new Date(),
      durationMs: Date.now() - startedAt,
      ...(ready ? {} : { message: "Check returned false." }),
    };
  } catch (error) {
    return {
      name,
      ready: false,
      critical,
      lastCheckedAt: new Date(),
      durationMs: Date.now() - startedAt,
      message:
        error instanceof Error
          ? `Check threw an error: ${error.message}`
          : "Check threw an error",
    };
  }
}
