/**
 * RPC client: builds request frames, sends them through an
 * {@link RPCTransport}, and rebuilds typed errors from error responses.
 */

export type { RPCCallOptions, RPCClientOptions } from "./rpcClient.core.js";

export { RPCClient } from "./rpcClient.core.js";

export { rpcErrorFromWire } from "./rpcWireError.helper.js";
