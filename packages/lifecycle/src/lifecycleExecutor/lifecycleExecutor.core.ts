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
import { LifecycleComponentError } from "@zudojs/errors";

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

      try {
        await withTimeout(
          async () => {
            const result = (
              hook as (ctx: LifecycleContext) => Promise<void> | void
            ).call(registration.component, context);
            if (result instanceof Promise) {
              await result;
            }
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
   * Executes a stage of components in parallel with concurrency limit.
   */
  public async executeStage(
    registrations: readonly LifecycleRegistration[],
    phase: LifecyclePhase,
    context: LifecycleContext,
    concurrency: number,
  ): Promise<readonly ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    await withConcurrency(registrations, concurrency, async (reg) => {
      const result = await this.execute(reg, phase, context);
      results.push(result);
    });

    return results;
  }
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
