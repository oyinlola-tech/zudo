import type { BackoffType } from "../jobTypes/jobTypes.type.js";

/**
 * Backoff configuration for retry attempts.
 */
export interface BackoffOptions {
  /** Backoff strategy type. */
  readonly type: BackoffType;
  /** Initial delay in milliseconds. */
  readonly delay: number;
  /** Maximum delay in milliseconds (for exponential). */
  readonly maxDelay?: number;
  /** Multiplier for exponential backoff. */
  readonly multiplier?: number;
  /**
   * Randomisation applied to the computed delay.
   *
   * `"full"` spreads retries uniformly over `[0, delay]`, `"equal"` keeps
   * half the delay fixed, `"none"` (the default) leaves the delay
   * deterministic. Jitter prevents jobs that failed together from
   * retrying together.
   */
  readonly jitter?: "none" | "full" | "equal";
}

/**
 * Options for adding a job to the queue.
 */
export interface JobOptions {
  /** Maximum number of attempts (default: 1, no retries). */
  readonly attempts?: number;
  /** Backoff configuration for retries. */
  readonly backoff?: BackoffOptions;
  /** Delay in milliseconds before the job becomes active. */
  readonly delay?: number;
  /** Job priority (higher number = higher priority). */
  readonly priority?: number;
  /** Timeout in milliseconds for job execution. */
  readonly timeout?: number;
  /** Key for job deduplication. */
  readonly deduplicationKey?: string;
  /** Timestamp when the job should be scheduled. */
  readonly scheduledAt?: Date;
  /** Additional metadata to attach to the job. */
  readonly metadata?: Record<string, unknown>;
}
