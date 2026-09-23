import type { RPCRequest } from "../../types/rpcRequest.type.js";

import type { RPCResponse } from "../../types/rpcResponse.type.js";

import type { RPCTransport } from "../rpcTransport.type.js";

import type { RPCFrameSerializer } from "../codec/rpcCodec.helper.js";

import { createRPCJsonSerializer } from "../codec/rpcCodec.helper.js";

import { RPCUnavailableError } from "../../errors/rpc.errors.js";

import { DEFAULT_RPC_HTTP_MAX_BODY_BYTES } from "../../constants/rpcConstants.core.js";

import { decode, encode, fetchOrThrow, linkSignals } from "./rpcHttpExchange.helper.js";

/** Headers accepted by the `Headers` constructor. */
export type RPCHttpHeaders = ConstructorParameters<typeof Headers>[0];

/**
 * Options for {@link createRPCHttpTransport}.
 */
export interface RPCHttpTransportOptions {
  /** Endpoint the server's fetch handler is mounted on. */
  readonly url: string | URL;
  /**
   * Extra request headers — a fixed set, or a function called per request
   * (for a short-lived bearer token). They cannot replace `content-type`.
   */
  readonly headers?: RPCHttpHeaders | ((request: RPCRequest) => RPCHttpHeaders | Promise<RPCHttpHeaders>);
  /** Fetch implementation. Defaults to the global `fetch`. */
  readonly fetch?: (input: string | URL, init: RequestInit) => Promise<Response>;
  /** Frame serializer. Must match the server's. Defaults to plain JSON. */
  readonly serializer?: RPCFrameSerializer;
  /** Largest response body accepted, in bytes. */
  readonly maxResponseBytes?: number;
}

/**
 * Creates a transport that POSTs each frame to a remote
 * {@link createRPCFetchHandler} with the global `fetch`.
 *
 * The client's signal and deadline (`options.timeout`) both abort the
 * underlying request, so a timed-out call releases its connection.
 * Failures are typed: a network error or a reply that is not an RPC frame
 * is an `RPCTransportError`, an expired deadline an `RPCTimeoutError`, a
 * caller abort an `RPCCancelledError`. An error frame from the server is
 * returned as a response for the client to rebuild into a typed error.
 */
export function createRPCHttpTransport(options: RPCHttpTransportOptions): RPCTransport {
  const serializer = options.serializer ?? createRPCJsonSerializer();
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_RPC_HTTP_MAX_BODY_BYTES;
  const url = new URL(options.url);
  let closed = false;

  return {
    async send(request, sendOptions = {}): Promise<RPCResponse> {
      if (closed) {
        throw new RPCUnavailableError("RPC HTTP transport has been closed.", request.procedure);
      }

      const body = encode(serializer, request);
      const signals = linkSignals(sendOptions);

      try {
        const headers = new Headers(
          typeof options.headers === "function" ? await options.headers(request) : options.headers,
        );
        headers.set("content-type", "application/json");
        headers.set("accept", "application/json");

        const response = await fetchOrThrow(
          () => doFetch(url, { method: "POST", headers, body, signal: signals.signal }),
          signals.signal,
          sendOptions,
          request.procedure,
        );

        return await decode(serializer, response, maxResponseBytes, request);
      } finally {
        signals.dispose();
      }
    },

    async close(): Promise<void> {
      closed = true;
    },
  };
}
