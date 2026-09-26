/**
 * Queue-specific error classes.
 *
 * Every class is owned by `@zudojs/errors` and re-exported here, so a queue
 * consumer can import the errors the queue throws — `JobDuplicateError` from
 * `add()`, `JobMaxAttemptsError` on a dead-lettered job — from the package
 * it already depends on. `instanceof` checks against either import path
 * match the same errors.
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
} from "@zudojs/errors";
export type { QueueErrorOptions } from "@zudojs/errors";
