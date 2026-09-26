/**
 * Wire mapping for failures of something the server itself called.
 *
 * A transport failure inside a handler is a dependency the server could not
 * reach, not a fault of the request: `RPC_UNAVAILABLE`, so the caller may
 * retry, with the transport's own text (hosts, paths) withheld. An
 * `RPCUnavailableError` carrying a `cause` is the dispatcher's wrap of such
 * a failure; its cause is worth logging, so it is reported as internal too.
 */

import {
  RPCTransportError,
  RPCUnavailableError,
} from "../errors/rpc.errors.js";

import { UNAVAILABLE_ERROR_MESSAGE } from "../constants/rpcConstants.core.js";

import type { RPCMappedError } from "./rpcErrorMapping.helper.js";

/**
 * Maps a downstream failure onto `RPC_UNAVAILABLE`, marked internal so the
 * original reaches `onInternalError`; `undefined` for anything else.
 */
export function mapDownstreamError(error: Error): RPCMappedError | undefined {
  if (error instanceof RPCTransportError) {
    return unavailable(UNAVAILABLE_ERROR_MESSAGE);
  }
  if (error instanceof RPCUnavailableError && error.cause !== undefined) {
    return unavailable(error.message);
  }
  return undefined;
}

function unavailable(message: string): RPCMappedError {
  return { payload: { code: "RPC_UNAVAILABLE", message }, internal: true };
}
