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

/**
 * When a job became runnable, in epoch milliseconds: its creation, or for a
 * delayed job the moment its delay elapsed.
 *
 * Ordering a due delayed job by `createdAt` let it jump ahead of every job
 * that had been ready and waiting while it was still delayed.
 */
export function runnableAt(job: Job<unknown>): number {
  const created = new Date(job.createdAt).getTime();
  if (!job.scheduledAt) return created;
  const scheduled = new Date(job.scheduledAt).getTime();
  return Number.isNaN(scheduled) ? created : Math.max(created, scheduled);
}

/**
 * Selects the job that runs next among those that are waiting and due.
 *
 * Higher priority first; within a priority, the job that became runnable
 * first ({@link runnableAt}); among equals, the one added first. The
 * incumbent is tracked by reference rather than by a sentinel priority, so
 * negative priorities are selectable like any other.
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
    if (job.scheduledAt && new Date(job.scheduledAt).getTime() > now) continue;
    if (predicate && !predicate(job)) continue;

    const at = runnableAt(job);
    if (
      next === null ||
      job.priority > next.priority ||
      (job.priority === next.priority && at < nextAt)
    ) {
      next = job;
      nextAt = at;
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
