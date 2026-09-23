/**
 * RPC binding: registers operations as `@zudojs/rpc` procedures, so any
 * RPC transport (in-memory, HTTP) can call them, with API errors mapped
 * onto RPC wire codes.
 */

export type { APIRpcBindingOptions, APIRpcProcedureTarget } from "./apiRpc.binding.js";

export {
  API_RPC_TIMEOUT_MARGIN_MS,
  createApiRpcProcedure,
  registerApiRpcProcedures,
} from "./apiRpc.binding.js";

export { apiErrorToRPCError } from "./apiRpc.errors.js";
