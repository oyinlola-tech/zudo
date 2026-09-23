import type { APIContext } from "../context/context.type.js";

import type { APIHandlerContext } from "../handler/handler.type.js";

import type { APIError } from "../errors/index.js";

import { APITimeoutError, createAPIError, ErrorCode } from "../errors/index.js";

/**
 * Error for an execution cancelled by the caller's `AbortSignal`.
 *
 * Carries `ErrorCode.OPERATION_CANCELLED` — branch on that, not on the
 * status code. `statusCode` is 499, an nginx convention ("Client Closed
 * Request") rather than an IANA status; this package is
 * transport-agnostic, so each adapter should map the *code* onto whatever
 * its protocol calls "cancelled" (gRPC `CANCELLED`, a dropped queue
 * message, a non-zero CLI exit) rather than passing 499 to the wire.
 */
export function abortedError(operationName: string): APIError {
  return createAPIError(`Operation "${operationName}" was aborted.`, {
    code: ErrorCode.OPERATION_CANCELLED,
    statusCode: 499,
    expose: true,
  });
}

/**
 * Returns a view of `context` whose `signal` is `signal`.
 *
 * Every other member resolves through the original context — `get`,
 * `set` and `metadata` are delegated to it, so a value an interceptor set
 * is visible to the handler and vice versa, and any extra members of a
 * hand-rolled context are reachable through the prototype chain.
 */
export function withContextSignal(
  context: APIContext,
  signal: AbortSignal,
): APIHandlerContext {
  const derived = Object.create(context, {
    signal: { value: signal, enumerable: true },
    requestId: { value: context.requestId, enumerable: true },
    state: { value: context.state, enumerable: true },
    get: { value: context.get.bind(context), enumerable: true },
    set: { value: context.set.bind(context), enumerable: true },
    metadata: { get: () => context.metadata, enumerable: true },
  }) as APIHandlerContext;
  return Object.freeze(derived);
}

/**
 * Runs `run` under a deadline and the caller's abort signal.
 *
 * `run` receives an `AbortSignal` that aborts when the deadline elapses
 * (reason: the `APITimeoutError` the call fails with) or the caller's
 * signal aborts (reason: the `OPERATION_CANCELLED` error the call fails
 * with). A cooperative handler that passes it on (to `fetch`, a driver
 * query, a loop check) therefore stops working instead of running on
 * with its result discarded — the source of duplicate side effects when
 * a client retries a timed-out call.
 *
 * `timeoutMs` is always a positive integer here — `defineOperation`
 * rejects anything else and `resolveOperationTimeout` substitutes the
 * default for hand-rolled operations — so the deadline can never be
 * silently disabled.
 */
export function withDeadline<T>(
  run: (signal: AbortSignal) => Promise<T> | T,
  timeoutMs: number,
  operationName: string,
  callerSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();

  return new Promise<T>((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onAbort);
    };

    const fail = (error: APIError): void => {
      cleanup();
      if (!controller.signal.aborted) {
        controller.abort(error);
      }
      reject(error);
    };

    const onAbort = (): void => fail(abortedError(operationName));

    const timer = setTimeout(
      () => fail(new APITimeoutError(timeoutMs)),
      timeoutMs,
    );

    callerSignal?.addEventListener("abort", onAbort, { once: true });
    if (callerSignal?.aborted) {
      onAbort();
      return;
    }

    let pending: Promise<T>;
    try {
      // `Promise.resolve`: a hand-rolled operation whose handler returns
      // synchronously is a legal JavaScript caller.
      pending = Promise.resolve(run(controller.signal));
    } catch (error) {
      pending = Promise.reject(error);
    }

    pending.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}
