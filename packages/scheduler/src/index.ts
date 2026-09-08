/**
 * @zudojs/scheduler
 *
 * Time and recurring execution engine for the Zudojs framework.
 *
 * Provides job definitions, schedules, triggers, priority queue,
 * cron support, and persistence abstractions.
 *
 * @example
 * ```ts
 * import { Scheduler, JobRegistry, JobExecutor, SystemClock } from "@zudojs/scheduler";
 *
 * const scheduler = new Scheduler();
 * scheduler.define({
 *   id: "cleanup",
 *   name: "Cleanup expired sessions",
 *   handler: async (context) => {
 *     await cleanupExpiredSessions();
 *   },
 * });
 *
 * scheduler.after("5m", "cleanup");
 * scheduler.start();
 * ```
 */

// Types
export type {
  SchedulerJobId,
  ScheduleId,
  ExecutionId,
  ScheduleType,
  ScheduleState,
  JobState,
  OverlapPolicy,
  MisfirePolicy,
  RetryStrategy,
  RetryPolicy,
  JobOptions,
  JobDefinition,
  JobHandler,
  JobContext,
  JobExecution,
  JobExecutionResult,
  Schedule,
  ScheduleOptions,
  ScheduleHandle,
  Trigger,
} from "./scheduler/types/index.js";

// Constants
export {
  DEFAULT_JOB_TIMEOUT,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY,
  MAX_TIMER_DELAY,
  MAX_JOBS,
  MAX_SCHEDULES,
  MAX_EXECUTION_HISTORY,
  DEFAULT_MISFIRE_POLICY,
  DEFAULT_OVERLAP_POLICY,
  SCHEDULER_TICK_INTERVAL,
} from "./scheduler/constants/index.js";

// Errors
export type { SchedulerErrorOptions } from "./scheduler/errors/index.js";

export {
  SchedulerError,
  SchedulerNotStartedError,
  SchedulerAlreadyStartedError,
  SchedulerStoppedError,
  SchedulerJobNotFoundError,
  SchedulerJobAlreadyExistsError,
  InvalidJobError,
  ScheduleNotFoundError,
  ScheduleAlreadyExistsError,
  InvalidScheduleError,
  CronParseError,
  InvalidDurationError,
  SchedulerJobExecutionError,
  SchedulerJobTimeoutError,
  SchedulerJobCancelledError,
  SchedulerStoreError,
  SchedulerLockError,
  createSchedulerError,
  isSchedulerError,
} from "./scheduler/errors/index.js";

// Job
export {
  createJobContext,
  createJobDefinition,
} from "./scheduler/job/index.js";

// Schedule
export { createSchedule } from "./scheduler/schedule/index.js";

// Schedule Handle
export { ScheduleHandleImpl } from "./scheduler/scheduleHandle/index.js";
export type { ScheduleHandleBinding } from "./scheduler/scheduleHandle/index.js";

// Trigger
export {
  DateTrigger,
  DelayTrigger,
  IntervalTrigger,
  CronTrigger,
} from "./scheduler/trigger/index.js";
export { parseCron, nextCronDate } from "./scheduler/trigger/index.js";
export type { ParsedCron } from "./scheduler/trigger/index.js";

// Clock
export { SystemClock, createSystemClock } from "./scheduler/clock/index.js";

// Registry
export { JobRegistry } from "./scheduler/registry/index.js";

// Executor
export { JobExecutor, retryDelay } from "./scheduler/executor/index.js";

// Priority Queue
export { PriorityQueue } from "./scheduler/priorityQueue/index.js";

// Duration
export { parseDuration } from "./scheduler/duration/index.js";

// Scheduler
export { Scheduler } from "./scheduler/scheduler.core.js";
export type {
  SchedulerOptions,
  SchedulerErrorEvent,
} from "./scheduler/scheduler.core.js";
