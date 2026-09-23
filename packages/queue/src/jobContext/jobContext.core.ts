import type { Job } from "../job/job.type.js";

import type { JobProgress } from "../jobResult/jobResult.type.js";

import type { JobContext } from "./jobContext.type.js";

/**
 * Creates a JobContext for a job processor.
 */
export function createJobContext<TData>(
  job: Job<TData>,
  signal: AbortSignal,
  options: {
    onProgress?: (progress: JobProgress) => Promise<void>;
    logger?: {
      info: (message: string, data?: Record<string, unknown>) => void;
    };
  } = {},
): JobContext<TData> {
  return {
    job,
    attemptNumber: job.attempt + 1,
    signal,
    updateProgress: async (progress: JobProgress) => {
      if (options.onProgress) {
        await options.onProgress(progress);
      }
    },
    log: (message: string, data?: Record<string, unknown>) => {
      if (options.logger) {
        options.logger.info(message, {
          jobId: job.id,
          jobName: job.name,
          queueName: job.queueName,
          ...data,
        });
      }
    },
  };
}

/**
 * Checks if a value is a valid JobContext.
 */
export function isJobContext(value: unknown): value is JobContext {
  return (
    typeof value === "object" &&
    value !== null &&
    "job" in value &&
    "signal" in value &&
    "updateProgress" in value &&
    "log" in value
  );
}
