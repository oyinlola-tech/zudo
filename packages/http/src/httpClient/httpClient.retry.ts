/**
 * @zudojs/http — HTTP client retry logic.
 *
 * Handles retry configuration, status-based retry decisions,
 * exponential backoff, and delay utilities.
 */

import type { HttpClientMethod, HttpRetryOptions } from "./httpClient.type.js";

import { HttpClientTimeoutError } from "./httpClient.error.js";

export type { HttpRetryOptions } from "./httpClient.type.js";

/**
 * Normalize retry options with defaults.
 */
export function normalizeRetryOptions(
  options?: HttpRetryOptions,
): HttpRetryOptions | undefined {
  if (!options) return undefined;
  return {
    retries: options.retries ?? 0,
    retryDelay: options.retryDelay ?? 1000,
    maxRetryDelay: options.maxRetryDelay ?? 30_000,
    retryStatusCodes: options.retryStatusCodes ?? [429, 502, 503, 504],
    retryMethods: options.retryMethods ?? ["GET", "HEAD", "OPTIONS"],
    retryOnNetworkError: options.retryOnNetworkError ?? true,
    retryOnTimeout:
      options.retryOnTimeout ?? options.retryOnNetworkError ?? true,
    backoff: options.backoff ?? "exponential",
    jitter: options.jitter ?? true,
  };
}

/**
 * Check if a status code should trigger a retry.
 */
export function shouldRetryStatus(
  status: number,
  method: string,
  retry?: HttpRetryOptions,
): boolean {
  if (!retry?.retryStatusCodes?.length) return false;
  if (!retry.retryMethods?.includes(method as HttpClientMethod)) return false;
  return retry.retryStatusCodes.includes(status);
}

/**
 * Check if an error should trigger a retry.
 *
 * Transport failures are retried when `retryOnNetworkError` is on, and
 * timeouts when `retryOnTimeout` is on (it defaults to
 * `retryOnNetworkError`). Both apply only to `retryMethods`, which default
 * to the idempotent `GET`, `HEAD` and `OPTIONS`. A caller's own abort is
 * never retried.
 */
export function shouldRetryError(
  error: unknown,
  method: string,
  retry?: HttpRetryOptions,
): boolean {
  if (!retry?.retries) return false;

  /*
   * A connection that drops (or a request that times out) after the server
   * processed it is indistinguishable from one that never arrived, so
   * replaying a non-idempotent method duplicates its side effects.
   * `retryMethods` exists for exactly this and was honoured only on the
   * status path.
   */
  if (!retry.retryMethods?.includes(method as HttpClientMethod)) return false;

  /*
   * Timeouts were never retried: `isRetryableNetworkError` does not match
   * `HttpClientTimeoutError`, so `retryOnNetworkError` had no effect on the
   * most common transient failure.
   */
  if (error instanceof HttpClientTimeoutError) {
    return retry.retryOnTimeout ?? retry.retryOnNetworkError ?? true;
  }

  if (!retry.retryOnNetworkError) return false;

  return isRetryableNetworkError(error);
}

/**
 * Narrows "is this a transport failure?" to errors that really are one.
 *
 * A bare `instanceof TypeError` also catches a body that has already been
 * consumed and parse failures, which are permanent and were being retried
 * until the budget ran out.
 */
function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.constructor.name === "FetchError") {
    return true;
  }

  if (error.name === "HttpClientNetworkError") {
    return true;
  }

  if (!(error instanceof TypeError)) {
    return false;
  }

  return !/body|disturbed|already (been )?(used|read)/i.test(error.message);
}

/**
 * Calculate the wait before retry number `attempt + 1`.
 *
 * The delay is `retryDelay` (fixed backoff) or `retryDelay * 2^attempt`
 * (exponential), capped at `maxRetryDelay`. With `jitter` (the default) the
 * wait is drawn uniformly from 0 up to that delay ("full jitter"), so a
 * burst of clients that failed together does not retry in lockstep;
 * `jitter: false` waits exactly the delay. Jitter used to add up to a
 * fixed 1000 ms whatever `retryDelay` was, so `retryDelay: 50` could wait
 * a second.
 */
export function calculateRetryDelay(
  attempt: number,
  retry: HttpRetryOptions,
): number {
  const base = retry.retryDelay ?? 1000;
  const max = retry.maxRetryDelay ?? 30_000;
  const ms = retry.backoff === "fixed" ? base : base * Math.pow(2, attempt);
  const capped = Math.max(0, Math.min(ms, max));

  return retry.jitter === false ? capped : Math.random() * capped;
}

/**
 * Delay for a given number of milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
