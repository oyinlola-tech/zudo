/**
 * Core type definitions for the queue system.
 *
 * Provides branded types for job IDs, queue names, and job names,
 * as well as lifecycle state enums and priority constants.
 */
export {
  JobState,
  JobPriorityLevels,
  BackoffType,
  WorkerState,
  createJobId,
  createQueueName,
  createJobName,
  isJobId,
  isQueueName,
  isJobName,
} from "./jobTypes.type.js";

export type {
  JobId,
  QueueName,
  JobName,
  JobPriority,
  BackoffStrategy,
} from "./jobTypes.type.js";
