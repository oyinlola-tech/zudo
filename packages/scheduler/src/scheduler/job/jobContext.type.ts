/**
 * Context passed to a job handler during execution.
 */
export interface JobContext<T = unknown> {
  readonly jobId: string;

  readonly executionId: string;

  readonly scheduledAt: Date;

  readonly startedAt: Date;

  /**
   * The attempt in progress, 1-based: `1` on the first run, `2` on the first
   * retry. Counts attempts within one execution, per the job's retry policy.
   */
  readonly attempt: number;

  /**
   * Alias of {@link JobContext.attempt}, named as in `@zudojs/queue`, whose
   * processor context carries the same 1-based `attemptNumber`.
   */
  readonly attemptNumber: number;

  readonly data: T;

  readonly signal: AbortSignal;
}

/**
 * Creates a job context.
 */
export function createJobContext<T = unknown>(
  jobId: string,
  executionId: string,
  scheduledAt: Date,
  startedAt: Date,
  attempt: number,
  data: T,
  signal: AbortSignal,
): JobContext<T> {
  return Object.freeze({
    jobId,
    executionId,
    scheduledAt,
    startedAt,
    attempt,
    attemptNumber: attempt,
    data,
    signal,
  });
}
