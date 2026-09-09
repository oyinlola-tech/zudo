/**
 * @zudojs/scheduler/types
 *
 * The scheduler's identity, state and policy vocabulary.
 *
 * Structural types — jobs, schedules, handles, triggers — live with the code
 * that builds them and are re-exported by `types/index.ts`. They used to be
 * declared a second time here, and the copies had drifted: the public
 * `ScheduleOptions` was missing `overlap` and `data`, so correct calls to
 * `scheduler.every(..., { overlap: "skip" })` did not typecheck.
 */

/**
 * Unique identifier for a scheduled job.
 */
export type SchedulerJobId = string;

/**
 * Unique identifier for a schedule.
 */
export type ScheduleId = string;

/**
 * Unique identifier for a job execution.
 */
export type ExecutionId = string;

/**
 * Type of schedule.
 */
export type ScheduleType = "once" | "delay" | "interval" | "cron";

/**
 * State of a schedule.
 */
export type ScheduleState = "active" | "paused" | "cancelled" | "completed";

/**
 * State of a job execution.
 */
export type JobState =
  "pending" | "running" | "completed" | "failed" | "cancelled" | "timed_out";

/**
 * Policy for handling overlapping executions.
 */
export type OverlapPolicy = "allow" | "skip" | "queue" | "replace";

/**
 * Policy for handling missed executions.
 */
export type MisfirePolicy = "skip" | "run-once" | "catch-up";

/**
 * Record of a job execution.
 */
export interface JobExecution {
  readonly id: ExecutionId;

  readonly jobId: SchedulerJobId;

  readonly scheduleId: ScheduleId;

  readonly status: JobState;

  readonly scheduledAt: Date;

  readonly startedAt?: Date;

  readonly completedAt?: Date;

  readonly duration?: number;

  readonly attempt: number;

  readonly error?: unknown;
}

/**
 * Result of a job execution.
 */
export interface JobExecutionResult {
  readonly success: boolean;

  readonly error?: unknown;
}

