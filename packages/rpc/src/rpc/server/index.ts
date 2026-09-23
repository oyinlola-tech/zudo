/**
 * RPC server: validates incoming frames, dispatches them to registered
 * procedures, and maps every failure onto a wire-safe error payload.
 */

export type { RPCServerOptions } from "./rpcServer.core.js";

export { RPCServer } from "./rpcServer.core.js";

export type { RPCMappedError } from "./rpcErrorMapping.helper.js";

export { mapRPCError } from "./rpcErrorMapping.helper.js";
