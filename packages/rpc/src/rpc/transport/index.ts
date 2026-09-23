/**
 * RPC transports: the {@link RPCTransport} contract an `RPCClient` sends
 * through, plus the built-in implementations — in-memory for tests and
 * modular monoliths, and HTTP (client transport and server fetch handler)
 * built on the web-standard Fetch API.
 */

export type {
  RPCTransport,
  RPCTransportRequestOptions,
} from "./rpcTransport.type.js";

export type {
  RPCFrameSerializer,
  RPCJsonSerializerOptions,
  RPCBodyReadResult,
  RPCBodySource,
} from "./codec/index.js";

export {
  createRPCJsonSerializer,
  isRPCResponseFrame,
  readBoundedBody,
} from "./codec/index.js";

export type {
  RPCFrameHandler,
  RPCMemoryTransportOptions,
} from "./memory/index.js";

export { createRPCMemoryTransport } from "./memory/index.js";

export type {
  RPCHttpHeaders,
  RPCHttpTransportOptions,
  RPCFetchHandlerOptions,
} from "./http/index.js";

export {
  createRPCHttpTransport,
  createRPCFetchHandler,
  RPC_HTTP_STATUS,
  rpcHttpStatus,
} from "./http/index.js";
