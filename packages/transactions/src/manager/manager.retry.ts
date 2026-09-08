/**
 * Transaction retry.
 *
 * `TransactionOptions.retry` has always been part of the public contract;
 * this is what honours it. Retries re-run the whole unit of work, because a
 * transaction that failed cannot be resumed — only replayed.
 *
 * @module manager/manager.retry
 */

import type { TransactionRetryOptions } from "../transactionTypes/transaction.interface.js";

/** Delay before a given attempt, in milliseconds. */
function delayFor(options: TransactionRetryOptions, attempt: number): number {
  const base = options.delay ?? 0;
  if (base <= 0) return 0;
  return options.backoff === "exponential" ? base * 2 ** (attempt - 1) : base;
}

/**
 * Run an operation, replaying it while retries remain.
 *
 * @param options - Retry configuration, or undefined for a single attempt.
 * @param operation - The unit of work, receiving the 1-based attempt number.
 * @returns The operation's result.
 * @throws The last error when every attempt fails.
 */
export async function withRetry<T>(
  options: TransactionRetryOptions | undefined,
  operation: (attempt: number) => Promise<T>,
): Promise<T> {
  const attempts = Math.max(0, options?.attempts ?? 0) + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;

      const isLast = attempt === attempts;
      const retryable = options?.shouldRetry?.(error, attempt) ?? true;
      if (isLast || !retryable) break;

      const delay = delayFor(options!, attempt);
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
