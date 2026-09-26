/**
 * Request encoding, fetch error typing and response decoding for
 * `createRPCHttpTransport`.
 */

import type { RPCRequest } from "../../types/rpcRequest.type.js";

import type { RPCResponse } from "../../types/rpcResponse.type.js";

import type { RPCTransportRequestOptions } from "../rpcTransport.type.js";

import type { RPCFrameSerializer } from "../codec/rpcCodec.helper.js";

import { isRPCResponseFrame } from "../codec/rpcCodec.helper.js";

import { readBoundedBody } from "../codec/rpcBody.helper.js";

import {
  RPCSerializationError,
  RPCTimeoutError,
  RPCTransportError,
} from "../../errors/rpc.errors.js";

import { combineSignals } from "../../reliability/cancellation/rpcCancellation.helper.js";

import { abortReasonToRPCError } from "../../reliability/cancellation/rpcAbort.helper.js";

import { MAX_TIMER_DELAY } from "../../constants/rpcConstants.core.js";

import { withCause } from "../../errors/rpcErrorCause.helper.js";

/**
 * Links the caller signal and the deadline into one abort signal.
 *
 * The deadline is clamped to the timer range, as the client's own timer
 * is: `AbortSignal.timeout` fires after 1 ms for anything past 2^31-1 ms
 * (about 24.8 days) and throws for a non-integer beyond 2^32-1, so a long
 * or `Infinity` timeout used to fail every call at once.
 */
export function linkSignals(options: RPCTransportRequestOptions): {
  readonly signal: AbortSignal;
  dispose(): void;
} {
  const timeout = options.timeout;
  const deadline =
    timeout !== undefined && timeout > 0
      ? AbortSignal.timeout(Math.min(Math.ceil(timeout), MAX_TIMER_DELAY))
      : undefined;
  return combineSignals(options.signal, deadline);
}

/** Runs the fetch, typing a failure as transport, timeout or cancellation. */
export async function fetchOrThrow(
  run: () => Promise<Response>,
  signal: AbortSignal,
  options: RPCTransportRequestOptions,
  procedure: string,
): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (!signal.aborted) {
      throw withCause(new RPCTransportError("RPC HTTP request failed.", procedure), error);
    }
    if (options.signal?.aborted) {
      throw abortReasonToRPCError(options.signal, procedure);
    }
    throw new RPCTimeoutError(options.timeout ?? 0, procedure);
  }
}

/** Serializes a request frame. */
export function encode(serializer: RPCFrameSerializer, request: RPCRequest): string {
  try {
    return serializer.serialize(request);
  } catch (error) {
    throw withCause(
      new RPCSerializationError("RPC request could not be serialized.", request.procedure),
      error,
    );
  }
}

/** Reads, parses and shape-checks the reply to `request`. */
export async function decode(
  serializer: RPCFrameSerializer,
  response: Response,
  maxBytes: number,
  request: RPCRequest,
): Promise<RPCResponse> {
  const read = await readBoundedBody(response, maxBytes);
  const failure = (detail: string): RPCTransportError =>
    new RPCTransportError(
      `RPC server replied with HTTP ${response.status} and ${detail}.`,
      request.procedure,
    );

  if (!read.ok) {
    throw failure(read.reason === "too-large" ? "an oversized body" : "an unreadable body");
  }

  let frame: unknown;
  try {
    frame = serializer.deserialize(read.text);
  } catch {
    throw failure("a body that is not valid JSON");
  }

  if (!isRPCResponseFrame(frame) || (frame.id !== request.id && frame.id !== "")) {
    throw failure("a body that is not a response to this request");
  }

  return frame;
}

