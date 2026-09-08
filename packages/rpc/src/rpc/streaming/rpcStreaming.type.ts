/**
 * @zudojs/rpc/streaming
 *
 * Streaming types for RPC operations.
 *
 * @remarks
 * These types describe a streaming contract but are **not yet
 * dispatchable**: `RPCProcedureRegistry` and `RPCServer` accept only
 * `RPCProcedure`, and `RPCTransport.send` resolves with a single
 * `RPCResponse` rather than a stream. A procedure built with
 * {@link createRPCStreamingProcedure} therefore cannot be registered or
 * called over a transport today. Use it to shape a handler ahead of
 * transport support; do not rely on it to serve traffic.
 */

/**
 * A streaming RPC procedure handler.
 */
export type RPCStreamingHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: RPCContext,
) => AsyncIterable<TOutput>;

import type { RPCContext } from "../context/rpcContext.type.js";

/**
 * An RPC streaming procedure definition.
 */
export interface RPCStreamingProcedure<TInput = unknown, TOutput = unknown> {
  readonly name: string;

  readonly handler: RPCStreamingHandler<TInput, TOutput>;
}

/**
 * Creates a streaming RPC procedure.
 */
export function createRPCStreamingProcedure<
  TInput = unknown,
  TOutput = unknown,
>(
  name: string,
  handler: RPCStreamingHandler<TInput, TOutput>,
): RPCStreamingProcedure<TInput, TOutput> {
  return Object.freeze({
    name,
    handler,
  });
}
