import type { Job } from "../job/job.type.js";
import type { JobId } from "../jobTypes/jobTypes.type.js";
import { updateJobState } from "../job/job.core.js";
import { JobState as JobStateEnum } from "../jobTypes/jobTypes.type.js";
import { MAX_TIMER_DELAY } from "../retryPolicy/retryPolicy.core.js";

/**
 * Schedule a job for future execution.
 *
 * The timer is registered so the queue can clear it on close, and
 * unreferenced so a scheduled job never by itself keeps the process
 * alive.
 */
export function scheduleJob<TData>(
  job: Job<TData>,
  scheduledTimers: Map<JobId, ReturnType<typeof setTimeout>>,
  jobs: Map<string, Job<TData>>,
): void {
  if (!job.scheduledAt) {
    return;
  }

  const scheduledTime = new Date(job.scheduledAt).getTime();

  if (Number.isNaN(scheduledTime)) {
    // An unparseable schedule would otherwise fire immediately via NaN
    // coercion; promote the job instead of guessing at a delay.
    jobs.set(job.id, updateJobState(job, JobStateEnum.WAITING));
    return;
  }

  const delay = Math.min(
    Math.max(0, scheduledTime - Date.now()),
    MAX_TIMER_DELAY,
  );

  const existing = scheduledTimers.get(job.id);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    scheduledTimers.delete(job.id);
    const currentJob = jobs.get(job.id);
    if (currentJob && currentJob.state === JobStateEnum.SCHEDULED) {
      jobs.set(job.id, updateJobState(currentJob, JobStateEnum.WAITING));
    }
  }, delay);

  timer.unref?.();

  scheduledTimers.set(job.id, timer);
}

/**
 * Promotes scheduled jobs whose time has arrived.
 *
 * This backstops the per-job timers: a timer that was never armed, or
 * that was delayed by a blocked event loop, still gets promoted on the
 * next poll.
 */
export function promoteDueScheduledJobs<TData>(
  jobs: Map<string, Job<TData>>,
  scheduledTimers?: Map<JobId, ReturnType<typeof setTimeout>>,
): void {
  const now = Date.now();

  for (const job of jobs.values()) {
    if (job.state !== JobStateEnum.SCHEDULED || !job.scheduledAt) {
      continue;
    }

    const scheduledTime = new Date(job.scheduledAt).getTime();
    if (Number.isNaN(scheduledTime) || scheduledTime <= now) {
      jobs.set(job.id, updateJobState(job, JobStateEnum.WAITING));

      const timer = scheduledTimers?.get(job.id);
      if (timer) {
        clearTimeout(timer);
        scheduledTimers?.delete(job.id);
      }
    }
  }
}

/**
 * Promote scheduled jobs that are ready to run.
 *
 * @deprecated Use {@link promoteDueScheduledJobs}, which also clears the
 * timer belonging to a promoted job.
 */
export function scheduleDelayedJobs<TData>(
  jobs: Map<string, Job<TData>>,
): void {
  promoteDueScheduledJobs(jobs);
}
