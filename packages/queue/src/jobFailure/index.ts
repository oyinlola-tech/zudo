/**
 * Permanent job failures: marking an error so the job is dead-lettered
 * without further attempts.
 *
 * @module jobFailure
 */

export {
  markUnrecoverable,
  createUnrecoverableJobError,
  isUnrecoverableJobError,
} from "./jobFailure.unrecoverable.js";
export type { UnrecoverableJobErrorOptions } from "./jobFailure.unrecoverable.js";
