/**
 * @zudojs/lifecycle/executor
 *
 * Lifecycle executor — runs component hooks with timeout, retry, and error handling.
 */

import type { LifecyclePhase } from "@zudojs/constants";
import type {
  LifecycleRegistration,
  LifecycleRetryOptions,
} from "../lifecycleComponent/lifecycleComponent.type.js";
import type { LifecycleContext } from "../lifecycleContext/lifecycleContext.type.js";
import { withTimeout, withConcurrency } from "../lifecycleInternal/index.js";
import { getComponentMethod } from "../lifecyclePhase/index.js";
import {
  LifecycleComponentError,
  LifecycleTimeoutError,
} from "@zudojs/errors";

/** Result of executing a component hook. */
export interface ExecutionResult {
  /** Component ID. */
  readonly id: string;
  /** The phase that was executed. */
  readonly phase: LifecyclePhase;
  /** Duration in ms. */
  readonly duration: number;
  /** Error if the hook failed. */
  readonly error?: unknown;
  /** Whether the operation succeeded. */
  readonly success: boolean;
}

/**
 * Executes lifecycle component hooks with timeout, retry, and concurrency support.
 */
export class LifecycleExecutor {
  /** Hook invocations still running after their timeout fired. */
  private readonly abandoned = new Set<Promise<unknown>>();

  /**
   * Resolves once every hook abandoned by a timeout has settled.
   *
   * Shutdown waits on this before stopping components, so `stop()`
   * never overlaps a `start()` that is still running.
   */
  public async settleAbandoned(): Promise<void> {
    while (this.abandoned.size > 0) {
      await Promise.allSettled([...this.abandoned]);
    }
  }

  /**
   * Executes a single component hook.
   */
  public async execute(
    registration: LifecycleRegistration,
    phase: LifecyclePhase,
    context: LifecycleContext,
  ): Promise<ExecutionResult> {
    const methodName = getComponentMethod(phase);
    const hook = (registration.component as unknown as Record<string, unknown>)[
      methodName
    ];

    if (typeof hook !== "function") {
      return {
        id: registration.id,
        phase,
        duration: 0,
        success: true,
      };
    }

    const startTime = Date.now();
    let lastError: unknown;

    const retryConfig = registration.retry;
    const maxAttempts = 1 + (retryConfig.attempts ?? 0);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // A hook must not be retried (or even started) once the run has
      // been cancelled — the context signal is aborted by the shutdown
      // deadline and by startup rollback.
      if (context.signal.aborted) {
        lastError ??= new LifecycleComponentError(
          registration.id,
          phase,
          context.signal.reason,
        );
        break;
      }

      let invocation: Promise<void> | undefined;

      try {
        await withTimeout(
          () => {
            invocation = (async () => {
              await (
                hook as (ctx: LifecycleContext) => Promise<void> | void
              ).call(registration.component, context);
            })();
            return invocation;
          },
          registration.timeout,
          registration.id,
          phase,
        );

        return {
          id: registration.id,
          phase,
          duration: Date.now() - startTime,
          success: true,
        };
      } catch (error) {
        lastError = error;

        // A timed-out hook is still running; withTimeout cannot cancel
        // it. Retrying would run the same start() concurrently (three
        // listen() calls on one port), so a timeout is final and the
        // abandoned invocation is tracked for shutdown to wait on.
        if (error instanceof LifecycleTimeoutError && invocation) {
          const abandoned = invocation.catch(() => undefined);
          this.abandoned.add(abandoned);
          void abandoned.finally(() => this.abandoned.delete(abandoned));
          break;
        }

        if (attempt < maxAttempts - 1) {
          const delay = calculateDelay(retryConfig, attempt);
          await sleep(delay, context.signal);
        }
      }
    }

    return {
      id: registration.id,
      phase,
      duration: Date.now() - startTime,
      // LifecycleComponentError was imported but never constructed, so
      // callers received a bare hook error with no indication of which
      // component or phase produced it.
      error:
        lastError instanceof LifecycleComponentError
          ? lastError
          : new LifecycleComponentError(registration.id, phase, lastError),
      success: false,
    };
  }

  /**
   * Executes a stage of components, honouring priority as a barrier.
   *
   * The stage arrives already ordered by priority (descending for
   * startup, ascending for shutdown). Components sharing a priority run
   * together, limited by `concurrency`; the next priority group only
   * begins once the previous one has settled. Launching the whole stage
   * concurrently made `priority` observable only at `concurrency: 1`,
   * so a `priority: 100` component documented as starting first lost
   * the race to any sibling with a faster hook.
   */
  public async executeStage(
    registrations: readonly LifecycleRegistration[],
    phase: LifecyclePhase,
    context: LifecycleContext,
    concurrency: number,
  ): Promise<readonly ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const batch of groupByPriority(registrations)) {
      await withConcurrency(batch, concurrency, async (reg) => {
        const result = await this.execute(reg, phase, context);
        results.push(result);
      });
    }

    return results;
  }
}

/**
 * Splits an already-ordered stage into runs of equal priority.
 *
 * Consecutive grouping preserves whatever order the execution plan
 * produced, so a caller that does not care about priority (every
 * component at the default 0) still gets a single fully concurrent
 * batch.
 */
function groupByPriority(
  registrations: readonly LifecycleRegistration[],
): readonly (readonly LifecycleRegistration[])[] {
  const batches: LifecycleRegistration[][] = [];
  let current: LifecycleRegistration[] | undefined;
  let currentPriority: number | undefined;

  for (const reg of registrations) {
    if (current === undefined || reg.priority !== currentPriority) {
      current = [];
      currentPriority = reg.priority;
      batches.push(current);
    }
    current.push(reg);
  }

  return batches;
}

/** Calculates retry delay with backoff. */
function calculateDelay(
  config: LifecycleRetryOptions,
  attempt: number,
): number {
  const base = config.delay ?? 500;
  const max = config.maxDelay ?? 10_000;
  const backoff = config.backoff ?? "exponential";

  if (backoff === "exponential") {
    return Math.min(base * 2 ** attempt, max);
  }
  return base;
}

/**
 * Sleeps for the given duration, waking early when the run is aborted.
 *
 * An unconditional timer would keep the process alive for a full retry
 * backoff after shutdown had already been requested.
 */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort(): void {
      clearTimeout(timer);
      resolve();
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}
