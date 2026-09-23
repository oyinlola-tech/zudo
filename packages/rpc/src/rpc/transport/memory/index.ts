/**
 * In-process transport: connects an `RPCClient` to an `RPCServer` in the
 * same process, serializing frames across the boundary by default.
 */

export type {
  RPCFrameHandler,
  RPCMemoryTransportOptions,
} from "./rpcMemoryTransport.core.js";

export { createRPCMemoryTransport } from "./rpcMemoryTransport.core.js";
