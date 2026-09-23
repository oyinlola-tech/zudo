import type { Job } from "../job/job.type.js";

import type { JobProgress } from "../jobResult/jobResult.type.js";

/**
 * Context provided to a job processor during execution.
 */
export interface JobContext<TData = unknown> {
  /** The job being processed. */
  readonly job: Job<TData>;
  /**
   * The attempt in progress, 1-based: `1` on the first run, `2` on the first
   * retry. Always `job.attempt + 1`, since `job.attempt` counts the attempts
   * already made. Matches `ctx.attempt` / `ctx.attemptNumber` in
   * `@zudojs/scheduler`.
   */
  readonly attemptNumber: number;
  /** AbortSignal for cancellation support. */
  readonly signal: AbortSignal;
  /** Update job progress. */
  updateProgress(progress: JobProgress): Promise<void>;
  /** Log a message with job context. */
  log(message: string, data?: Record<string, unknown>): void;
}
