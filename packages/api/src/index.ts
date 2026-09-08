/**
 * @zudojs/api
 *
 * Application-facing API layer for the Zudojs framework.
 *
 * Provides transport-agnostic operation definitions, execution context,
 * interceptors, and result types.
 *
 * @example
 * ```ts
 * import {
 *   defineOperation,
 *   APIOperationRegistry,
 *   APIExecutor,
 *   createAPIContext,
 * } from "@zudojs/api";
 *
 * const getUser = defineOperation({
 *   name: "users.get",
 *   input: GetUserSchema, // any Standard Schema (Zod, Valibot, ArkType, …)
 *   output: UserSchema,
 *   handler: async (input, context) => userService.findById(input.id),
 * });
 *
 * const registry = new APIOperationRegistry();
 * registry.register(getUser);
 *
 * const executor = new APIExecutor();
 * const context = createAPIContext("req-1", {});
 * const result = await executor.execute(
 *   registry.require("users.get"),
 *   { id: "123" },
 *   context,
 * );
 * ```
 */

// Result types
export type {
  APISuccess,
  APIFailure,
  APIResult,
} from "./api/result/apiResult.type.js";

export {
  apiSuccess,
  apiFailure,
  isApiSuccess,
  isApiFailure,
} from "./api/result/apiResult.type.js";

// Errors
export type { APIErrorOptions } from "./api/errors/index.js";

export {
  APIError,
  APIValidationError,
  APIAuthenticationError,
  APIAuthorizationError,
  APINotFoundError,
  APIConflictError,
  APIRateLimitError,
  APITimeoutError,
  APIUnavailableError,
  APIInternalError,
  APIVersionError,
  APIOperationNotFoundError,
  APIDuplicateOperationError,
  APIIdempotencyError,
  createAPIError,
  isAPIError,
  ErrorCode,
} from "./api/errors/index.js";

// Constants
export {
  DEFAULT_OPERATION_TIMEOUT,
  MAX_OPERATION_TIMEOUT,
  MAX_INTERCEPTORS,
  MAX_VALIDATION_ISSUES,
  MAX_VALIDATION_ISSUE_LENGTH,
  MAX_OPERATION_NAME_LENGTH,
  MAX_REQUEST_ID_LENGTH,
} from "./api/constants.js";

// Context
export type { APIContext, APIContextKey } from "./api/context/context.type.js";

export {
  createAPIContext,
  createContextKey,
  isValidRequestId,
  normalizeRequestId,
  RequestIdContextKey,
  CorrelationIdContextKey,
  TenantIdContextKey,
  UserIdContextKey,
  StartTimeContextKey,
} from "./api/context/context.type.js";

// Handler
export type { APIHandler } from "./api/handler/handler.type.js";

// Operation
export type {
  AnyAPIOperation,
  APIOperation,
  APIOperationMetadata,
  DefineOperationOptions,
} from "./api/operation/operation.type.js";

export {
  defineOperation,
  resolveOperationTimeout,
} from "./api/operation/operation.type.js";

// Registry
export { APIOperationRegistry } from "./api/registry/index.js";

// Interceptors
export type {
  APIInterceptor,
  APIExecutionContext,
} from "./api/interceptors/interceptor.type.js";

export { createNoopInterceptor } from "./api/interceptors/interceptor.type.js";

// Executor
export type { APIExecutorOptions } from "./api/executor/index.js";

export { APIExecutor, normalizeAPIError } from "./api/executor/index.js";
