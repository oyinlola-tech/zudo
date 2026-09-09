/**
 * @zudojs/scheduler/errors
 *
 * Scheduler-specific error classes for the Zudojs framework.
 *
 * Re-exported from @zudojs/errors for convenience.
 *
 * Only the classes this package can actually raise are re-exported. The
 * store, lock, not-started and schedule-lookup errors were re-exported here
 * too, and nothing in an in-process scheduler with no persistence and no
 * cross-process locking could ever throw one. They remain available from
 * @zudojs/errors for a durable scheduler built on top.
 */

export {
  SchedulerError,
  SchedulerAlreadyStartedError,
  SchedulerStoppedError,
  SchedulerJobNotFoundError,
  SchedulerJobAlreadyExistsError,
  InvalidJobError,
  InvalidScheduleError,
  CronParseError,
  InvalidDurationError,
  SchedulerJobExecutionError,
  SchedulerJobTimeoutError,
  SchedulerJobCancelledError,
  createSchedulerError,
  isSchedulerError,
} from "@zudojs/errors";

export type { SchedulerErrorOptions } from "@zudojs/errors";
