import type { Job } from "../job/job.type.js";
import type { Queue } from "../queue/queue.type.js";

import type {
  Worker,
  WorkerOptions,
  WorkerStats,
  WorkerLifecycleState,
} from "./worker.type.js";

import {
  JobState as JobStateEnum,
  WorkerState,
} from "../jobTypes/jobTypes.type.js";

import { WorkerLifecycleError } from "@zudojs/errors";

/** How long `stop()` waits for in-flight jobs before forcing a stop. */
const DEFAULT_DRAIN_TIMEOUT_MS = 30_000;

/**
 * Creates a new Worker.
 *
 * The worker claims each job before running it, so a job is never picked
 * up twice — by this worker on its next poll, or by another worker on the
 * same queue.
 */
export function createWorker<TData>(
  id: string,
  queue: Queue<TData>,
  options?: WorkerOptions,
): Worker<TData> {
  let state: WorkerLifecycleState = WorkerState.CREATED;
  const stats = { processed: 0, succeeded: 0, failed: 0 };
  const concurrency = Math.max(1, options?.concurrency ?? 1);
  const pollInterval = options?.pollInterval ?? 100;
  const drainTimeout = options?.drainTimeout ?? DEFAULT_DRAIN_TIMEOUT_MS;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let activeJobs = 0;
  let polling = false;
  let abortController: AbortController | null = null;

  const onError =
    options?.onError ??
    ((error: unknown) => {
      queueMicrotask(() => {
        console.error(`[@zudojs/queue] Worker "${id}" poll failed.`, error);
      });
    });

  /**
   * Arms the next poll. At most one timer is ever armed: a delayed poll
   * already pending is left alone, while an immediate poll (capacity just
   * freed up, or a job was just dispatched) supersedes it.
   */
  const scheduleNextPoll = (delay: number): void => {
    if (state !== WorkerState.RUNNING) {
      return;
    }

    if (pollTimer !== null) {
      if (delay > 0) return;
      clearTimeout(pollTimer);
    }

    pollTimer = setTimeout(runPoll, delay);
    pollTimer.unref?.();
  };

  /**
   * Wraps `poll` so a rejection can never escape as an unhandled promise
   * rejection — which, under a runtime configured to treat those as
   * fatal, would take down the whole application.
   */
  const runPoll = (): void => {
    pollTimer = null;
    void poll().catch((error: unknown) => {
      onError(error);
      scheduleNextPoll(pollInterval);
    });
  };

  /**
   * Runs one claimed job to completion and frees its concurrency slot.
   *
   * Deliberately not awaited by `poll`: awaiting it there serialised the
   * worker, so `concurrency` was reported by `getStats()` and honoured by
   * nothing.
   */
  const runClaimedJob = async (job: Job<TData>): Promise<void> => {
    try {
      // Dispatch through the queue rather than invoking the processor
      // directly. The queue owns job state, retry, dead-lettering and
      // middleware; calling the processor here left every job the worker
      // ran stuck in `active` forever.
      await queue.runJob(job, {
        ...(options?.middleware ? { middleware: options.middleware } : {}),
        ...(abortController ? { signal: abortController.signal } : {}),
        ...(options?.timeoutMs !== undefined
          ? { timeoutMs: options.timeoutMs }
          : {}),
      });

      const settled = await queue.getJob(job.id);

      if (settled?.state === JobStateEnum.COMPLETED) {
        stats.succeeded++;
      } else {
        stats.failed++;
      }
    } catch (error) {
      stats.failed++;
      onError(error);
    } finally {
      activeJobs--;
      // A slot just opened: poll again immediately, yielding to the event
      // loop first so a saturated queue cannot starve timers.
      scheduleNextPoll(0);
    }
  };

  const poll = async (): Promise<void> => {
    if (
      polling ||
      state !== WorkerState.RUNNING ||
      abortController?.signal.aborted
    ) {
      return;
    }

    polling = true;
    try {
      if (activeJobs >= concurrency) {
        scheduleNextPoll(pollInterval);
        return;
      }

      const job = await queue.claimNextJob();
      if (!job) {
        scheduleNextPoll(pollInterval);
        return;
      }

      const proc = queue.getProcessor(job.name);
      if (!proc) {
        // Claimed but unrunnable: release it rather than stranding it in
        // `active` where nothing would ever pick it up again.
        await queue.releaseJob(job.id);
        scheduleNextPoll(pollInterval);
        return;
      }

      activeJobs++;
      stats.processed++;
      void runClaimedJob(job);

      // Capacity may remain: look for more work now, not after this job
      // settles.
      scheduleNextPoll(0);
    } finally {
      polling = false;
    }
  };

  const clearPollTimer = (): void => {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  return {
    id,
    queue,
    queueName: queue.name,

    get state(): WorkerLifecycleState {
      return state;
    },

    async start(): Promise<void> {
      if (state !== WorkerState.CREATED && state !== WorkerState.STOPPED) {
        throw new WorkerLifecycleError(
          `Worker "${id}" cannot start from state "${state}".`,
          { workerId: id },
        );
      }

      state = WorkerState.STARTING;
      abortController = new AbortController();

      try {
        state = WorkerState.RUNNING;
        scheduleNextPoll(0);
      } catch (error) {
        state = WorkerState.FAILED;
        throw error;
      }
    },

    /**
     * Stops accepting new jobs and waits for in-flight ones to finish.
     *
     * The wait is bounded: past `drainTimeout` the worker force-stops
     * rather than hanging shutdown on a job that never settles.
     */
    async stop(): Promise<void> {
      if (state !== WorkerState.RUNNING && state !== WorkerState.STARTING) {
        // Still clear any timer armed before the state moved on.
        clearPollTimer();
        return;
      }

      state = WorkerState.DRAINING;
      clearPollTimer();

      // Graceful means graceful: in-flight jobs get `drainTimeout` to
      // finish on their own. Aborting them up front — as this once did —
      // made `stop()` indistinguishable from `forceStop()` for any
      // processor that honours its signal, and turned every routine
      // shutdown into a batch of failed jobs.
      const deadline = Date.now() + Math.max(0, drainTimeout);

      while (activeJobs > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      if (activeJobs > 0) {
        onError(
          new WorkerLifecycleError(
            `Worker "${id}" still had ${activeJobs} job(s) in flight after ${drainTimeout}ms; forcing stop.`,
            { workerId: id },
          ),
        );
        abortController?.abort();
      }

      clearPollTimer();
      state = WorkerState.STOPPED;
    },

    async forceStop(): Promise<void> {
      abortController?.abort();
      clearPollTimer();
      state = WorkerState.STOPPED;
    },

    isRunning(): boolean {
      return state === WorkerState.RUNNING;
    },

    getStats(): WorkerStats {
      return {
        ...stats,
        concurrency,
        state,
      };
    },
  };
}

/**
 * Checks if a value is a valid Worker.
 */
export function isWorker(value: unknown): value is Worker {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "queueName" in value &&
    "state" in value &&
    "start" in value &&
    "stop" in value
  );
}
