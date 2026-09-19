/**
 * RPC execution context: per-call state, the caller's (untrusted) frame
 * metadata, the transport's trusted `auth`, and the validated `input`.
 */

export type {
  RPCAuthContext,
  RPCContext,
  RPCContextOptions,
} from "./rpcContext.type.js";

export { createRPCContext } from "./rpcContext.type.js";
