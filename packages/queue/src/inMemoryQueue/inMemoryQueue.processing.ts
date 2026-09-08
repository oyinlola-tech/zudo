import type { Job } from "../job/job.type.js";
import type { Processor } from "../processor/processor.type.js";
import type { JobResult } from "../jobResult/jobResult.type.js";
import type { JobId } from "../jobTypes/jobTypes.type.js";
import type { QueueMiddleware } from "../middleware/middleware.type.js";
import type { QueueEventEmitter } from "../queueEmitter/queueEmitter.type.js";
import type { DeadLetterStore } from "../deadLetter/deadLetter.type.js";

import { updateJobState, incrementJobAttempt } from "../job/job.core.js";
import { JobState as JobStateEnum } from "../jobTypes/jobTypes.type.js";

import { createJobContext } from "../jobContext/jobContext.core.js";
import {
  createMiddlewareChain,
  createTimeoutMiddleware,
} from "../middleware/middleware.core.js";
import {
  calculateRetryDelay,
  resolveBackoff,
  shouldRetry,
} from "../retryPolicy/retryPolicy.core.js";
import { moveToDeadLetter } from "../deadLetter/deadLetter.core.js";

import { JobMaxAttemptsError } from "@zudojs/errors";

/**
 * Mutable throughput counters.
 *
 * Passed by reference so increments are visible to the queue that owns
 * them; a copied object literal would discard every update.
 */
export interface QueueCounters {
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  retriedCount: number;
  deadLetteredCount: number;
}

/**
 * Collaborators a job needs in order to run.
 */
export interface ProcessJobDependencies<TData> {
  readonly jobs: Map<string, Job<TData>>;
  readonly emitter: QueueEventEmitter;
  readonly deadLetterStore: DeadLetterStore<TData>;
  readonly counters: QueueCounters;
  readonly middleware: readonly QueueMiddleware[];
  /**
   * Registers the timer that returns a retrying job to `waiting`, so the
   * queue can clear it on close instead of leaking it.
   */
  readonly registerRetryTimer: (
    jobId: JobId,
    timer: ReturnType<typeof setTimeout>,
  ) => void;
  /** Invoked whenever a job reaches a terminal state. */
  readonly onSettled?: (job: Job<TData>) => void;
  /** Whether the owning queue has been disposed. */
  readonly isDisposed: () => boolean;
}

/**
 * Narrows a processor's return value to a `JobResult`.
 *
 * A processor may return a `JobResult`, a plain value, or nothing.
 * Testing `"success" in result` without this guard throws a `TypeError`
 * for a primitive return, which surfaced as the job failing and being
 * dead-lettered.
 */
function isJobResult(value: unknown): value is JobResult {
  return typeof value === "object" && value !== null && "success" in value;
}

/**
 * Process a single job with middleware, retry, and failure handling.
 *
 * The job is expected to already be claimed (`active`); this records the
 * start time, runs the middleware chain, and routes the outcome to
 * completion, retry, or the dead letter store.
 */
export async function processJob<TData>(
  job: Job<TData>,
  processor: Processor<TData>,
  options: { timeoutMs?: number; abortController?: AbortController },
  deps: ProcessJobDependencies<TData>,
): Promise<void> {
  const { jobs, emitter, counters } = deps;

  const updatedJob = updateJobState(job, JobStateEnum.ACTIVE, {
    startedAt: new Date().toISOString() as never,
  });
  jobs.set(updatedJob.id, updatedJob);

  emitter.emit("job:started", { job: updatedJob });

  const abortController = options.abortController ?? new AbortController();
  const context = createJobContext<TData>(updatedJob, abortController.signal, {
    onProgress: async (progress) => {
      const current = jobs.get(updatedJob.id);
      if (current === undefined) {
        return;
      }
      emitter.emit("job:progress", {
        job: current,
        progress: progress.percent,
      });
    },
  });

  const timeoutMs = options.timeoutMs ?? 30_000;
  const timeoutMiddleware = createTimeoutMiddleware(timeoutMs, () => {
    // Let a cooperative processor observe the timeout and stop working
    // instead of running on with its result discarded.
    if (!abortController.signal.aborted) {
      abortController.abort(
        new Error(`Job "${updatedJob.id}" timed out after ${timeoutMs}ms.`),
      );
    }
  });

  const middlewareChain = createMiddlewareChain([
    timeoutMiddleware,
    ...deps.middleware,
  ]);

  try {
    const result = await middlewareChain({
      job: updatedJob,
      context,
      next: async () => {
        return processor(updatedJob, context) as Promise<JobResult | void>;
      },
    });

    if (isJobResult(result) && !result.success) {
      await handleJobFailure(updatedJob, result.error ?? "Job failed", deps);
    } else {
      const completedJob = updateJobState(updatedJob, JobStateEnum.COMPLETED, {
        completedAt: new Date().toISOString() as never,
      });
      jobs.set(updatedJob.id, completedJob);
      counters.succeededCount++;
      emitter.emit("job:completed", {
        job: completedJob,
        // A processor may return a `JobResult`, a plain value, or
        // nothing. Only the first carries its payload under `data`.
        result: isJobResult(result) ? result.data : result,
      });
      deps.onSettled?.(completedJob);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await handleJobFailure(updatedJob, errorMessage, deps);
  } finally {
    counters.processedCount++;
  }
}

/**
 * Handle job failure with retry logic.
 *
 * A failure that will be retried is reported as `job:retrying` and counted
 * separately; only a terminal failure increments `failedCount`, so the
 * counters describe outcomes rather than attempts.
 */
export async function handleJobFailure<TData>(
  job: Job<TData>,
  errorMessage: string,
  deps: ProcessJobDependencies<TData>,
): Promise<void> {
  const { jobs, emitter, counters, deadLetterStore } = deps;

  const failedJob = updateJobState(job, JobStateEnum.FAILED, {
    error: errorMessage,
    failedAt: new Date().toISOString() as never,
  });
  jobs.set(job.id, failedJob);

  emitter.emit("job:failed", {
    job: failedJob,
    error: new Error(errorMessage),
  });

  const incrementedJob = incrementJobAttempt(failedJob);
  jobs.set(job.id, incrementedJob);

  if (shouldRetry(incrementedJob.attempt, incrementedJob.maxAttempts)) {
    const retryingJob = updateJobState(incrementedJob, JobStateEnum.RETRYING);
    jobs.set(job.id, retryingJob);

    counters.retriedCount++;

    emitter.emit("job:retrying", {
      job: retryingJob,
      attempt: incrementedJob.attempt,
    });

    const backoff = resolveBackoff(incrementedJob.backoff);
    const delay = calculateRetryDelay(incrementedJob.attempt, backoff);

    const timer = setTimeout(() => {
      if (deps.isDisposed()) {
        return;
      }

      const currentJob = jobs.get(job.id);
      if (currentJob && currentJob.state === JobStateEnum.RETRYING) {
        const waitingJob = updateJobState(currentJob, JobStateEnum.WAITING, {
          error: undefined,
          failedAt: undefined,
        });
        jobs.set(job.id, waitingJob);
      }
    }, delay);

    // `unref` keeps a pending retry from holding the process open; the
    // queue clears the timer explicitly on close.
    timer.unref?.();
    deps.registerRetryTimer(job.id, timer);

    return;
  }

  counters.failedCount++;
  counters.deadLetteredCount++;

  const maxAttemptsError = new JobMaxAttemptsError(
    job.id,
    incrementedJob.attempt,
    incrementedJob.maxAttempts,
    { queueName: job.queueName },
  );

  try {
    await moveToDeadLetter(deadLetterStore, incrementedJob, maxAttemptsError, {
      reason: errorMessage,
    });
  } catch {
    // A dead letter store that rejects must not mask the original
    // failure or strand the job in `failed`.
  }

  const deadLetterJob = updateJobState(
    incrementedJob,
    JobStateEnum.DEAD_LETTER,
    { error: maxAttemptsError.message },
  );
  jobs.set(job.id, deadLetterJob);
  deps.onSettled?.(deadLetterJob);
}
