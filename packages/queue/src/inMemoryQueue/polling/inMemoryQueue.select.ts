/**
 * Which job runs next, and whether any job is still owed a run.
 *
 * @module inMemoryQueue/polling/inMemoryQueue.select
 */

import type { Job } from "../../job/job.type.js";
import { JobState as JobStateEnum } from "../../jobTypes/jobTypes.type.js";

/** States in which a job still has a run ahead of it. */
const PENDING_STATES: ReadonlySet<JobStateEnum> = new Set([
  JobStateEnum.WAITING,
  JobStateEnum.SCHEDULED,
  JobStateEnum.RETRYING,
  JobStateEnum.ACTIVE,
]);

/** Parsed timestamps of a job record, cached for the lifetime of the record. */
interface JobTimes {
  /** See {@link runnableAt}. */
  readonly runnableAt: number;
  /** When a delayed job falls due; `-Infinity` for a job with no delay. */
  readonly dueAt: number;
}

/**
 * Job records are immutable and replaced on every state change, so a parsed
 * timestamp stays valid for as long as the record itself is reachable. The
 * cache turns the per-poll cost of a waiting job from an ISO-8601 parse (or
 * two, for a delayed job) into a map lookup.
 */
const jobTimes = new WeakMap<Job<unknown>, JobTimes>();

function timesOf(job: Job<unknown>): JobTimes {
  const cached = jobTimes.get(job);
  if (cached !== undefined) return cached;

  const created = new Date(job.createdAt).getTime();
  const scheduled = job.scheduledAt
    ? new Date(job.scheduledAt).getTime()
    : Number.NaN;
  const times: JobTimes = Number.isNaN(scheduled)
    ? { runnableAt: created, dueAt: Number.NEGATIVE_INFINITY }
    : { runnableAt: Math.max(created, scheduled), dueAt: scheduled };

  jobTimes.set(job, times);
  return times;
}

/**
 * When a job became runnable, in epoch milliseconds: its creation, or for a
 * delayed job the moment its delay elapsed.
 *
 * Ordering a due delayed job by `createdAt` let it jump ahead of every job
 * that had been ready and waiting while it was still delayed.
 */
export function runnableAt(job: Job<unknown>): number {
  return timesOf(job).runnableAt;
}

/**
 * Selects the job that runs next among those that are waiting and due.
 *
 * Higher priority first; within a priority, the job that became runnable
 * first ({@link runnableAt}); among equals, the one added first. The
 * incumbent is tracked by reference rather than by a sentinel priority, so
 * negative priorities are selectable like any other.
 *
 * One pass over the job map per selection. A job that cannot beat the
 * incumbent on priority is skipped before its timestamps are consulted, and
 * timestamps are parsed once per record, so the pass is a state check per
 * job rather than a date parse per job.
 */
export function selectNextJob<TData>(
  jobs: Iterable<Job<TData>>,
  now: number,
  predicate?: (job: Job<TData>) => boolean,
): Job<TData> | null {
  let next: Job<TData> | null = null;
  let nextAt = 0;

  for (const job of jobs) {
    if (job.state !== JobStateEnum.WAITING) continue;
    if (next !== null && job.priority < next.priority) continue;

    const times = timesOf(job);
    if (times.dueAt > now) continue;
    if (predicate && !predicate(job)) continue;

    if (
      next === null ||
      job.priority > next.priority ||
      times.runnableAt < nextAt
    ) {
      next = job;
      nextAt = times.runnableAt;
    }
  }

  return next;
}

/** Whether any job a consumer can run is still owed a run. */
export function hasPendingWork<TData>(
  jobs: Iterable<Job<TData>>,
  isConsumable: (job: Job<TData>) => boolean,
): boolean {
  for (const job of jobs) {
    if (PENDING_STATES.has(job.state) && isConsumable(job)) return true;
  }
  return false;
}
