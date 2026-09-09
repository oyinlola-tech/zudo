/**
 * The package's public type surface.
 *
 * Identity, state and policy vocabulary comes from `schedulerTypes.core.ts`;
 * every structural type is re-exported from the module that owns it, so the
 * type a consumer imports is the one the implementation actually uses.
 */

export type {
  SchedulerJobId,
  ScheduleId,
  ExecutionId,
  ScheduleType,
  ScheduleState,
  JobState,
  OverlapPolicy,
  MisfirePolicy,
  JobExecution,
  JobExecutionResult,
} from "./schedulerTypes.core.js";

export type {
  JobOptions,
  RetryPolicy,
  RetryStrategy,
  JobDefinition,
  JobHandler,
  JobContext,
} from "../job/index.js";

export type { Schedule, ScheduleOptions } from "../schedule/index.js";

export type { ScheduleHandle } from "../scheduleHandle/index.js";

export type { Trigger } from "../trigger/index.js";
