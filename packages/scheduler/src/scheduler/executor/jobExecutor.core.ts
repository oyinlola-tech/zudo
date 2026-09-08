import type { JobDefinition } from "../job/jobDefinition.type.js";

import type { RetryPolicy } from "../job/jobOptions.type.js";

import type { JobExecutionResult } from "../types/schedulerTypes.core.js";

import type { Clock } from "../clock/schedulerClock.type.js";

import { createJobContext } from "../job/jobContext.type.js";

import {
  SchedulerJobExecutionError,
  SchedulerJobCancelledError,
  SchedulerJobTimeoutError,
} from "../errors/scheduler.errors.js";

import {
  DEFAULT_JOB_TIMEOUT,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY,
} from "../constants/schedulerConstants.core.js";

/** Marker attached to the rejection a timeout produces, carrying its budget. */
const TIMEOUT = Symbol("scheduler.timeout");

/**
 * Executes a job with timeout, cancellation and retry support.
 */
export class JobExecutor {
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  /**
   * Executes a job, retrying according to its retry policy.
   *
   * @param job - The job definition.
   * @param executionId - Identifier for this execution.
   * @param scheduledAt - The time the job was scheduled to run.
   * @param attempt - The attempt number to start from (1-based).
   * @param signal - Signal that aborts the job and stops further retries.
   * @param data - Optional payload handed to the handler.
   * @returns The execution result.
   */
  async execute(
    job: JobDefinition,
    executionId: string,
    scheduledAt: Date,
    attempt: number,
    signal: AbortSignal,
    data?: unknown,
  ): Promise<JobExecutionResult> {
    const retry = job.options?.retry;
    const maxAttempts = Math.max(1, retry?.attempts ?? 1);

    let currentAttempt = attempt;
    let lastError: Error | undefined;

    for (let i = 0; i < maxAttempts; i++, currentAttempt++) {
      if (signal.aborted) {
        throw new SchedulerJobCancelledError(
          "Job was cancelled via signal.",
          job.id,
        );
      }

      try {
        await this.runOnce(
          job,
          executionId,
          scheduledAt,
          currentAttempt,
          signal,
          data,
        );
        return { success: true };
      } catch (error) {
        if (signal.aborted) {
          throw new SchedulerJobCancelledError(
            "Job was cancelled via signal.",
            job.id,
          );
        }

        lastError = this.classify(error, job.id);

        // Last attempt, or nothing to retry with.
        if (i === maxAttempts - 1) break;

        const delay = retryDelay(retry, currentAttempt);
        if (delay > 0) {
          await sleep(delay, signal);
        }
      }
    }

    throw (
      lastError ??
      new SchedulerJobExecutionError("Unknown job execution error.", job.id)
    );
  }

  /** Runs the handler once, under a timeout that also aborts it. */
  private async runOnce(
    job: JobDefinition,
    executionId: string,
    scheduledAt: Date,
    attempt: number,
    signal: AbortSignal,
    data: unknown,
  ): Promise<void> {
    const timeout = job.options?.timeout ?? DEFAULT_JOB_TIMEOUT;

    // A dedicated controller per attempt, chained to the caller's signal, so a
    // timeout actually aborts the handler instead of only rejecting the
    // wrapper while the work carries on.
    const controller = new AbortController();
    const onParentAbort = () => controller.abort(signal.reason);
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener("abort", onParentAbort, { once: true });
    }

    const context = createJobContext(
      job.id,
      executionId,
      scheduledAt,
      this.clock.now(),
      attempt,
      data,
      controller.signal,
    );

    try {
      await this.withTimeout(
        () => Promise.resolve(job.handler(context)),
        timeout,
        controller,
      );
    } finally {
      signal.removeEventListener("abort", onParentAbort);
    }
  }

  /** Maps a thrown value onto the scheduler's error taxonomy. */
  private classify(error: unknown, jobId: string): Error {
    const budget =
      typeof error === "object" && error !== null
        ? (error as { [TIMEOUT]?: number })[TIMEOUT]
        : undefined;

    if (typeof budget === "number") {
      // SchedulerJobTimeoutError builds its own message from the budget.
      return new SchedulerJobTimeoutError(budget, jobId);
    }

    if (error instanceof SchedulerJobCancelledError) {
      return error;
    }

    // Carry the original error rather than flattening it to a message string,
    // which used to discard the stack and any nested cause. The published
    // error class takes no options bag, so the cause is attached directly.
    const wrapped = new SchedulerJobExecutionError(
      error instanceof Error ? error.message : "Unknown job execution error.",
      jobId,
    );
    Object.defineProperty(wrapped, "cause", {
      value: error,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    return wrapped;
  }

  /**
   * Wraps an operation with a timeout that aborts it.
   */
  private async withTimeout<T>(
    operation: () => Promise<T>,
    timeout: number,
    controller: AbortController,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = new Error(
          `Job timed out after ${timeout}ms.`,
        ) as Error & {
          [TIMEOUT]: number;
        };
        error[TIMEOUT] = timeout;
        // Abort first so a handler that observes its signal can wind down.
        controller.abort(error);
        reject(error);
      }, timeout);
      if (timer.unref) timer.unref();
    });

    try {
      return await Promise.race([operation(), timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

/**
 * Computes the delay before the next retry attempt.
 *
 * `RetryPolicy` has carried strategy, delay, maxDelay and jitter since the
 * package was written; none of it was ever applied.
 */
export function retryDelay(
  policy: RetryPolicy | undefined,
  attempt: number,
): number {
  if (!policy) return 0;

  const base = policy.delay ?? DEFAULT_RETRY_DELAY;
  const attempts = Math.min(attempt, DEFAULT_MAX_RETRIES * 4);

  let delay: number;
  switch (policy.strategy) {
    case "linear":
      delay = base * attempts;
      break;
    case "exponential":
      delay = base * Math.pow(2, Math.max(0, attempts - 1));
      break;
    case "fixed":
    default:
      delay = base;
      break;
  }

  if (policy.maxDelay !== undefined) {
    delay = Math.min(delay, policy.maxDelay);
  }

  if (policy.jitter) {
    // Full jitter: spreads a thundering herd of retries across the window.
    delay = Math.random() * delay;
  }

  return Math.max(0, Math.round(delay));
}

/** Sleeps, resolving early if the signal aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    if (timer.unref) timer.unref();

    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }

    signal.addEventListener("abort", finish, { once: true });
  });
}
