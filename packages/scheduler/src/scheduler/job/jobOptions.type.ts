import type { OverlapPolicy } from "../types/schedulerTypes.core.js";

/**
 * Options for a scheduled job.
 */
export interface JobOptions {
  /** Per-execution timeout in ms. Default: 30 000. */
  readonly timeout?: number;

  /** Retry policy applied to a failing execution. */
  readonly retry?: RetryPolicy;

  /**
   * Maximum executions of this job in flight at once, across every schedule
   * that fires it. A fire time arriving at the ceiling is held and dispatched
   * as soon as an execution finishes.
   */
  readonly concurrency?: number;

  /**
   * Default overlap policy for every schedule of this job.
   * `ScheduleOptions.overlap` overrides it.
   */
  readonly overlap?: OverlapPolicy;
}

/**
 * Retry policy for job executions.
 */
export interface RetryPolicy {
  readonly attempts: number;

  readonly strategy: RetryStrategy;

  readonly delay: number;

  readonly maxDelay?: number;

  readonly jitter?: boolean;
}

/**
 * Retry strategy.
 */
export type RetryStrategy = "fixed" | "linear" | "exponential";
