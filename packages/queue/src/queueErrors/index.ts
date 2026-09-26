/**
 * Queue error classes, re-exported from `@zudojs/errors`.
 *
 * @module queueErrors
 */

export {
  QueueError,
  createQueueError,
  isQueueError,
  toQueueError,
  QueueConnectionError,
  QueueNotFoundError,
  QueueClosedError,
  QueueDisposedError,
  JobError,
  JobNotFoundError,
  JobTimeoutError,
  JobCancelledError,
  JobSerializationError,
  JobDeserializationError,
  JobProcessingError,
  JobDuplicateError,
  JobMaxAttemptsError,
  JobStalledError,
  WorkerError,
  WorkerNotFoundError,
  WorkerLifecycleError,
} from "./queueError.base.js";
export type { QueueErrorOptions } from "./queueError.base.js";
