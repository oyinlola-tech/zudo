/**
 * Bindings that expose one set of operations over many transports — HTTP
 * (a web-standard fetch handler), RPC, queues and the command line, plus
 * OpenAPI route descriptors — with
 * the same executor, interceptors, validation and client-safe error shape
 * on every one.
 *
 * This barrel is the package's public binding surface; runner and
 * route-matching internals stay in the subfolder barrels.
 */

export type {
  APIBindingOptions,
  APIOperationSource,
  APIWireError,
  APIWireResult,
} from "./shared/index.js";

export {
  API_INTERNAL_ERROR_MESSAGE,
  toApiWireError,
  toApiWireResult,
} from "./shared/index.js";

export type {
  APIHttpMethod,
  APIRouteInputSource,
  APIOperationHttpOptions,
  APIOperationRoute,
  DescribeApiRoutesOptions,
} from "./route/index.js";

export { describeApiRoutes, resolveApiRoute } from "./route/index.js";

export type { APIFetchHandlerOptions } from "./fetch/index.js";

export { createApiFetchHandler, DEFAULT_API_MAX_BODY_BYTES } from "./fetch/index.js";

export type { APIRpcBindingOptions, APIRpcProcedureTarget } from "./rpc/index.js";

export {
  API_RPC_TIMEOUT_MARGIN_MS,
  apiErrorToRPCError,
  createApiRpcProcedure,
  registerApiRpcProcedures,
} from "./rpc/index.js";

export type { APIQueueBindingOptions, APIQueueTarget } from "./queue/index.js";

export { bindApiQueue, createApiQueueProcessor } from "./queue/index.js";

export type {
  APICliInvocation,
  APICliIO,
  APICliOptions,
  APICliParseResult,
  APICliExitCodeValue,
} from "./cli/index.js";

export { APICliExitCode, parseApiCliArgs, runApiCli } from "./cli/index.js";

export type { ToOpenAPIRouteDescriptorsOptions } from "./openapi/index.js";

export {
  apiSuccessBodySchema,
  apiWireErrorBodySchema,
  toOpenAPIRouteDescriptor,
  toOpenAPIRouteDescriptors,
} from "./openapi/index.js";
