import type { EntityId } from "@zudojs/constants";

/**
 * Unique identifier for a job.
 */
export type JobId = EntityId & { readonly __brand: "JobId" };

/**
 * Name of a queue.
 */
export type QueueName = string & {
  readonly __brand: "QueueName";
};

/**
 * Name of a job type.
 */
export type JobName = string & {
  readonly __brand: "JobName";
};

/**
 * Lifecycle states for a job.
 */
export enum JobState {
  WAITING = "waiting",
  SCHEDULED = "scheduled",
  ACTIVE = "active",
  COMPLETED = "completed",
  FAILED = "failed",
  RETRYING = "retrying",
  CANCELLED = "cancelled",
  PAUSED = "paused",
  DEAD_LETTER = "dead_letter",
}

/**
 * Priority levels for jobs (higher number = higher priority).
 */
export type JobPriority = number;

/**
 * Default priority constants.
 */
export const JobPriorityLevels = Object.freeze({
  LOW: 10,
  NORMAL: 50,
  HIGH: 100,
  CRITICAL: 200,
} as const);

/**
 * Backoff strategy types.
 */
export enum BackoffType {
  FIXED = "fixed",
  EXPONENTIAL = "exponential",
}

/**
 * A backoff strategy as either the enum member or its string value.
 *
 * Job options routinely arrive from JSON — a config file, a broker payload,
 * an HTTP body — where `"fixed"` is the only spelling available. The runtime
 * has always compared against the string values, but a bare `BackoffType`
 * annotation rejected them, so correct calls failed to typecheck.
 */
export type BackoffStrategy = `${BackoffType}`;

/**
 * Worker lifecycle states.
 */
export enum WorkerState {
  CREATED = "created",
  STARTING = "starting",
  RUNNING = "running",
  DRAINING = "draining",
  STOPPED = "stopped",
  FAILED = "failed",
}

/**
 * Creates a JobId from a string.
 */
export function createJobId(id: string): JobId {
  return id as JobId;
}

/**
 * Creates a QueueName from a string.
 */
export function createQueueName(name: string): QueueName {
  return name as QueueName;
}

/**
 * Creates a JobName from a string.
 */
export function createJobName(name: string): JobName {
  return name as JobName;
}

/**
 * Checks if a value is a valid JobId.
 */
export function isJobId(value: unknown): value is JobId {
  return typeof value === "string" && value.length > 0;
}

/**
 * Checks if a value is a valid QueueName.
 */
export function isQueueName(value: unknown): value is QueueName {
  return typeof value === "string" && value.length > 0;
}

/**
 * Checks if a value is a valid JobName.
 */
export function isJobName(value: unknown): value is JobName {
  return typeof value === "string" && value.length > 0;
}
