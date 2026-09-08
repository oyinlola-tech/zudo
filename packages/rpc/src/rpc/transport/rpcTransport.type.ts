import type { RPCRequest } from "../types/rpcRequest.type.js";

import type { RPCResponse } from "../types/rpcResponse.type.js";

/**
 * Options for RPC transport requests.
 */
export interface RPCTransportRequestOptions {
  readonly signal?: AbortSignal;

  readonly timeout?: number;
}

/**
 * Transport interface for sending and receiving RPC messages.
 */
export interface RPCTransport {
  /**
   * Sends a request and resolves with the peer's response.
   *
   * `options.signal` aborts the in-flight send. A transport that ignores
   * it still works — the client races the signal itself — but the
   * underlying connection is only released by a transport that honours
   * it.
   */
  send(
    request: RPCRequest,
    options?: RPCTransportRequestOptions,
  ): Promise<RPCResponse>;

  close?(): Promise<void>;
}
