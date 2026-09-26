/**
 * Marking a job failure as permanent.
 *
 * By default every failure is retried until `attempts` is exhausted. Some
 * failures are known to be permanent the moment they happen — a payload
 * that fails validation, a record that no longer exists — and retrying them
 * only burns the remaining attempts and delays the dead-letter entry an
 * operator needs to see. A processor marks such a failure unrecoverable and
 * the queue dead-letters the job at once.
 *
 * @module jobFailure/unrecoverable
 */

import { JobError } from "@zudojs/errors";

/** Brand carried by an error whose job must not be retried. */
const UNRECOVERABLE = Symbol.for("@zudojs/queue.unrecoverable");

/**
 * Options for {@link createUnrecoverableJobError}.
 */
export interface UnrecoverableJobErrorOptions {
  readonly queueName?: string;
  readonly jobId?: string;
  readonly cause?: unknown;
}

/**
 * Marks an error so the job that throws it is dead-lettered without
 * further attempts. Works on any error, including one from a library the
 * processor calls into.
 *
 * @example
 * ```ts
 * queue.process("charge", async (job) => {
 *   const card = await cards.find(job.data.cardId);
 *   if (!card) throw markUnrecoverable(new Error("card no longer exists"));
 * });
 * ```
 */
export function markUnrecoverable<TError extends object>(
  error: TError,
): TError {
  if (!Object.prototype.hasOwnProperty.call(error, UNRECOVERABLE)) {
    Object.defineProperty(error, UNRECOVERABLE, {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  return error;
}

/**
 * Creates a `JobError` already marked unrecoverable.
 *
 * @example
 * ```ts
 * throw createUnrecoverableJobError("payload failed validation", {
 *   jobId: job.id,
 *   queueName: job.queueName,
 * });
 * ```
 */
export function createUnrecoverableJobError(
  message: string,
  options: UnrecoverableJobErrorOptions = {},
): JobError {
  return markUnrecoverable(
    new JobError(message, {
      queueName: options.queueName,
      jobId: options.jobId,
      cause: options.cause,
    }),
  );
}

/**
 * Whether a thrown value was marked with {@link markUnrecoverable}.
 */
export function isUnrecoverableJobError(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { readonly [UNRECOVERABLE]?: unknown })[UNRECOVERABLE] === true
  );
}
