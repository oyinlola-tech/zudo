import { randomUUID } from "node:crypto";
import type { Timestamp } from "@zudojs/constants";

import type { JobId, JobState } from "../jobTypes/jobTypes.type.js";

import type { Job, JobInput } from "./job.type.js";

import {
  createJobId,
  JobState as JobStateEnum,
} from "../jobTypes/jobTypes.type.js";

/**
 * Creates a new job instance.
 */
export function createJob<TData>(
  input: JobInput<TData>,
  id?: JobId,
): Job<TData> {
  const now = new Date().toISOString() as Timestamp;
  const options = input.options;
  const jobId =
    id ?? createJobId(`job_${Date.now()}_${randomUUID().replace(/-/g, "")}`);

  return {
    id: jobId,
    name: input.name,
    queueName: input.queueName,
    data: input.data,
    state:
      options?.delay || options?.scheduledAt
        ? JobStateEnum.SCHEDULED
        : JobStateEnum.WAITING,
    attempt: 0,
    maxAttempts: options?.attempts ?? 1,
    priority: options?.priority ?? 50,
    createdAt: now,
    updatedAt: now,
    scheduledAt: options?.scheduledAt
      ? (options.scheduledAt.toISOString() as Timestamp)
      : options?.delay
        ? (new Date(Date.now() + options.delay).toISOString() as Timestamp)
        : undefined,
    timeoutMs: options?.timeout,
    deduplicationKey: options?.deduplicationKey,
    metadata: options?.metadata,
    backoff: options?.backoff
      ? {
          type: options.backoff.type,
          delay: options.backoff.delay,
          maxDelay: options.backoff.maxDelay,
          multiplier: options.backoff.multiplier,
          jitter: options.backoff.jitter,
        }
      : undefined,
  };
}

/**
 * Checks if a value is a valid Job.
 */
export function isJob(value: unknown): value is Job {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value &&
    "state" in value &&
    "data" in value
  );
}

/**
 * Updates a job's state.
 */
export function updateJobState<TData>(
  job: Job<TData>,
  state: JobState,
  additional?: Partial<
    Pick<Job, "error" | "startedAt" | "completedAt" | "failedAt">
  >,
): Job<TData> {
  const now = new Date().toISOString() as Timestamp;

  return {
    ...job,
    state,
    updatedAt: now,
    ...additional,
  };
}

/**
 * Increments a job's attempt counter.
 */
export function incrementJobAttempt<TData>(job: Job<TData>): Job<TData> {
  return {
    ...job,
    attempt: job.attempt + 1,
    updatedAt: new Date().toISOString() as Timestamp,
  };
}
