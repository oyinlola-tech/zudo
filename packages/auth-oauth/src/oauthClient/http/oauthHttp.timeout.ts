/**
 * Request deadline that keeps the process alive until it fires.
 *
 * @module oauthClient/http/oauthHttp.timeout
 *
 * `AbortSignal.timeout()` schedules its timer *unref'd*: if nothing else
 * holds the event loop — a CLI, a one-shot script, a test runner's last
 * await — Node exits with code 13 ("unsettled top-level await") before the
 * deadline ever fires, and the caller never sees the documented
 * `OAuthNetworkError`. A plain `setTimeout` is ref'd, so the deadline is
 * guaranteed to be observed; `clear()` releases it as soon as the request
 * settles so a fast response does not hold the process open.
 */

/** A deadline bound to one provider request. */
export interface RequestDeadline {
  /** Pass as `signal` to `fetch`. Aborts with a `TimeoutError`. */
  readonly signal: AbortSignal;
  /**
   * Settle `promise` or reject with the timeout, whichever comes first.
   *
   * The global `fetch` rejects as soon as `signal` aborts, but a
   * caller-supplied `config.fetch` (or the body stream of a hand-built
   * `Response`) may ignore the signal; racing makes the deadline hold
   * either way.
   */
  race<T>(promise: Promise<T>): Promise<T>;
  /** Release the timer. Idempotent; call once the request has settled. */
  clear(): void;
}

/**
 * Create a request deadline of `timeoutMs` milliseconds.
 *
 * The abort reason is a `DOMException` named `TimeoutError`, the same
 * shape `AbortSignal.timeout()` produces, so `fetch` rejections are
 * classified identically by the caller.
 */
export function createRequestDeadline(timeoutMs: number): RequestDeadline {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(
      new DOMException(
        `The operation was aborted due to timeout after ${timeoutMs}ms.`,
        "TimeoutError",
      ),
    );
  }, timeoutMs);
  const signal = controller.signal;
  return {
    signal,
    race<T>(promise: Promise<T>): Promise<T> {
      if (signal.aborted) return Promise.reject(signal.reason);
      return new Promise<T>((resolve, reject) => {
        const onAbort = (): void => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(resolve, reject).finally(() => {
          signal.removeEventListener("abort", onAbort);
        });
      });
    },
    clear(): void {
      clearTimeout(timer);
    },
  };
}
