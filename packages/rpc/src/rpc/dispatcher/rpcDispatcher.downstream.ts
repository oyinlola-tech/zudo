/**
 * Translation of downstream failures raised inside a handler.
 *
 * A handler that calls another service over RPC gets that client's errors:
 * an `RPCTransportError` when the peer could not be reached, an
 * `RPCTimeoutError` when it did not answer in time. Rethrown as they are,
 * the transport error went out as `RPC_INTERNAL_ERROR` (its code is not
 * public vocabulary) and the timeout as `RPC_TIMEOUT` — which told the
 * caller *this* procedure had timed out, when it was a dependency that had.
 * Both are one condition from the caller's point of view: the service is
 * unavailable right now, and the call may be retried.
 */

import {
  RPCTimeoutError,
  RPCTransportError,
  RPCUnavailableError,
} from "../errors/rpc.errors.js";

import { withCause } from "../errors/rpcErrorCause.helper.js";

import { UNAVAILABLE_ERROR_MESSAGE } from "../constants/rpcConstants.core.js";

/**
 * Returns the error a handler's failure should propagate as.
 *
 * A downstream failure becomes an `RPCUnavailableError` with the original
 * as `cause`; the server maps it to `RPC_UNAVAILABLE` and hands the cause
 * to `onInternalError`. Downstream means an `RPCTransportError` (only a
 * transport raises one) or an `RPCTimeoutError` that names a procedure
 * other than this one — an `RPCClient` stamps the procedure it was calling
 * on every timeout it raises. A timeout about this procedure — the
 * dispatcher's own, which a cooperative handler rethrows from
 * `context.signal.reason`, or one a handler throws under its own name —
 * stays `RPC_TIMEOUT`, as does everything else.
 */
export function toUpstreamError(
  error: unknown,
  procedureName: string,
  signal: AbortSignal,
): unknown {
  if (signal.aborted && error === signal.reason) {
    return error;
  }

  const downstream =
    error instanceof RPCTransportError ||
    (error instanceof RPCTimeoutError &&
      error.procedureName !== undefined &&
      error.procedureName !== procedureName);

  if (downstream) {
    return withCause(
      new RPCUnavailableError(UNAVAILABLE_ERROR_MESSAGE, procedureName),
      error,
    );
  }

  return error;
}
