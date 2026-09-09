import type { Job } from "../job/job.type.js";

import type { JobContext } from "../jobContext/jobContext.type.js";

import type { JobResult } from "../jobResult/jobResult.type.js";

/**
 * A function that processes a job.
 *
 * A processor may return a {@link JobResult} to report success or failure
 * explicitly, a plain value to be carried on `job:completed`, or nothing at
 * all. The queue narrows the three cases at runtime; the previous signature
 * admitted only the first two, so a processor returning its own value — the
 * common case — failed to typecheck against a queue that handled it happily.
 */
export type Processor<TData = unknown, TResult = unknown> = (
  job: Job<TData>,
  context: JobContext<TData>,
) => Promise<JobResult<TResult> | TResult | void>;

/**
 * Metadata about a registered processor.
 */
export interface ProcessorInfo {
  /** The job name this processor handles. */
  readonly jobName: string;
  /** When the processor was registered. */
  readonly registeredAt: Date;
  /** Optional description. */
  readonly description?: string;
}

/**
 * Registry for job processors.
 */
export interface ProcessorRegistry {
  /** Register a processor for a job type. */
  register<TData, TResult>(
    jobName: string,
    processor: Processor<TData, TResult>,
    options?: { description?: string },
  ): void;
  /** Get a processor by job name. */
  get<TData, TResult>(jobName: string): Processor<TData, TResult> | undefined;
  /** Check if a processor is registered. */
  has(jobName: string): boolean;
  /** Get all registered processor info. */
  getAll(): ProcessorInfo[];
  /** Remove a processor. */
  unregister(jobName: string): boolean;
  /** Clear all processors. */
  clear(): void;
}

/**
 * Checks if a value is a valid Processor.
 */
export function isProcessor(value: unknown): value is Processor {
  return typeof value === "function";
}

/**
 * Assert that a value can actually process a job.
 *
 * Registering a non-function succeeded silently and failed much later, deep
 * inside job processing, as a job that "failed" and was dead-lettered.
 *
 * @param value - The candidate processor.
 * @param jobName - The job name it is being registered for.
 * @throws {TypeError} when the value is not callable.
 */
export function assertProcessor(
  value: unknown,
  jobName: string,
): asserts value is Processor {
  if (!isProcessor(value)) {
    throw new TypeError(
      `Processor for job "${jobName}" must be a function; received ${
        value === null ? "null" : typeof value
      }.`,
    );
  }
}
