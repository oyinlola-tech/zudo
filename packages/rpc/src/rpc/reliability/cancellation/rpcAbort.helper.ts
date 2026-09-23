/**
 * @zudojs/rpc/reliability/cancellation
 *
 * Abort helpers used by transports to turn a signal into a typed error.
 */

import { isRPCError, RPCCancelledError } from "../../errors/rpc.errors.js";
import type { RPCError } from "../../errors/rpc.errors.js";

/**
 * Converts an aborted signal's reason into a typed RPC error: an RPC
 * error reason (such as the client's `RPCTimeoutError`) passes through,
 * anything else becomes an `RPCCancelledError`.
 */
export function abortReasonToRPCError(
  signal: AbortSignal,
  procedureName?: string,
): RPCError {
  const reason: unknown = signal.reason;
  return isRPCError(reason)
    ? reason
    : new RPCCancelledError("Call cancelled by caller.", procedureName);
}

/**
 * Settles with `promise`, or rejects as soon as `signal` aborts.
 */
export function raceAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  procedureName?: string,
): Promise<T> {
  if (signal === undefined) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(abortReasonToRPCError(signal, procedureName));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void =>
      reject(abortReasonToRPCError(signal, procedureName));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
