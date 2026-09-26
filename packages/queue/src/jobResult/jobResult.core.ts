import type { Timestamp } from "@zudojs/constants";

import type { JobResult, JobProgress } from "./jobResult.type.js";

/**
 * Creates a successful job result.
 */
export function createJobResult<T>(data: T, durationMs: number): JobResult<T> {
  return {
    success: true,
    data,
    durationMs,
    timestamp: new Date().toISOString() as Timestamp,
  };
}

/**
 * Creates a failed job result.
 *
 * @param error - The failure message.
 * @param durationMs - How long the attempt ran.
 * @param options - Pass `unrecoverable: true` to dead-letter the job at
 *   once instead of retrying it.
 */
export function createJobErrorResult(
  error: string,
  durationMs: number,
  options: { readonly unrecoverable?: boolean } = {},
): JobResult {
  return {
    success: false,
    error,
    ...(options.unrecoverable === true ? { unrecoverable: true } : {}),
    durationMs,
    timestamp: new Date().toISOString() as Timestamp,
  };
}

/**
 * Creates a job progress update.
 */
export function createJobProgress(
  percent: number,
  options: {
    step?: string;
    totalSteps?: number;
    currentStep?: number;
    message?: string;
  } = {},
): JobProgress {
  return {
    percent: Math.max(0, Math.min(100, percent)),
    step: options.step,
    totalSteps: options.totalSteps,
    currentStep: options.currentStep,
    message: options.message,
    timestamp: new Date().toISOString() as Timestamp,
  };
}
