import type { Timestamp } from "@zudojs/constants";

import type {
  JobId,
  JobName,
  JobState,
  JobPriority,
  BackoffType,
} from "../jobTypes/jobTypes.type.js";

import type { JobOptions } from "../jobOptions/jobOptions.type.js";

/**
 * A unit of work in the queue system.
 */
export interface Job<TData = unknown> {
  /** Unique identifier for the job. */
  readonly id: JobId;
  /** Name/type of the job. */
  readonly name: JobName;
  /** Queue this job belongs to. */
  readonly queueName: string;
  /** Job payload data. */
  readonly data: TData;
  /** Current state of the job. */
  readonly state: JobState;
  /** Number of attempts made. */
  readonly attempt: number;
  /** Maximum number of attempts allowed. */
  readonly maxAttempts: number;
  /** Job priority. */
  readonly priority: JobPriority;
  /** When the job was created. */
  readonly createdAt: Timestamp;
  /** When the job was last updated. */
  readonly updatedAt: Timestamp;
  /** When the job should be processed (for delayed jobs). */
  readonly scheduledAt?: Timestamp;
  /** When the job started processing. */
  readonly startedAt?: Timestamp;
  /** When the job completed. */
  readonly completedAt?: Timestamp;
  /** When the job failed. */
  readonly failedAt?: Timestamp;
  /** Error message if the job failed. */
  readonly error?: string;
  /** Timeout in milliseconds. */
  readonly timeoutMs?: number;
  /** Deduplication key. */
  readonly deduplicationKey?: string;
  /** Additional metadata. */
  readonly metadata?: Record<string, unknown>;
  /** Backoff configuration. */
  readonly backoff?: {
    readonly type: BackoffType;
    readonly delay: number;
    readonly maxDelay?: number;
    readonly multiplier?: number;
    readonly jitter?: "none" | "full" | "equal";
  };
}

/**
 * Input data for creating a new job.
 */
export interface JobInput<TData = unknown> {
  /** Name/type of the job. */
  readonly name: JobName;
  /** Queue this job belongs to. */
  readonly queueName: string;
  /** Job payload data. */
  readonly data: TData;
  /** Job options. */
  readonly options?: JobOptions;
}
