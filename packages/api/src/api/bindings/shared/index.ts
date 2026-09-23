/**
 * Runtime shared by every binding: the operation source and options
 * types, the runner that builds the context and executes a call, and the
 * client-safe wire form of results and errors.
 */

export type { APIBindingOptions, APIOperationSource } from "./apiBinding.type.js";

export type { APIBoundCall, APIBoundOutcome } from "./apiBinding.helper.js";

export { createOperationRunner, listOperations } from "./apiBinding.helper.js";

export type { APIWireError, APIWireResult } from "./apiWireResult.helper.js";

export {
  API_INTERNAL_ERROR_MESSAGE,
  apiErrorStatus,
  toApiWireError,
  toApiWireResult,
} from "./apiWireResult.helper.js";
