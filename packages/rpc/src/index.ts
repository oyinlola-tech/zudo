/**
 * @zudojs/rpc
 *
 * Remote Procedure Call abstraction for the Zudojs framework.
 *
 * Provides transport-agnostic procedure invocation, middleware,
 * client/server contracts, and reliability utilities.
 *
 * @example
 * ```ts
 * import {
 *   RPCServer,
 *   RPCClient,
 *   createRPCProcedure,
 *   createRPCMemoryTransport,
 * } from "@zudojs/rpc";
 *
 * const server = new RPCServer();
 * server.register(createRPCProcedure("users.getUser", async (input) => {
 *   return userService.findById(input.id);
 * }));
 *
 * // In-process; swap for createRPCHttpTransport({ url }) across the network.
 * const client = new RPCClient(createRPCMemoryTransport(server));
 * const user = await client.call("users.getUser", { id: "123" });
 * ```
 */

// Types
export type {
  RPCProcedureName,
  RPCMetadata,
  RPCMetadataOptions,
  RPCRequest,
  RPCRequestOptions,
  RPCErrorPayload,
  RPCResponse,
} from "./rpc/types/index.js";

export {
  createRPCMetadata,
  createRPCRequest,
  createRPCResponse,
  createRPCErrorResponse,
} from "./rpc/types/index.js";

// Constants
export {
  DEFAULT_RPC_TIMEOUT,
  MAX_RPC_PAYLOAD_SIZE,
  MAX_RPC_REQUEST_ID_LENGTH,
  MAX_PENDING_REQUESTS,
  MAX_MIDDLEWARE,
  MAX_PROCEDURES,
  MAX_PROCEDURE_NAME_LENGTH,
  MAX_TIMER_DELAY,
  PROCEDURE_NAME_PATTERN,
  INTERNAL_ERROR_MESSAGE,
  DEFAULT_RPC_HTTP_MAX_BODY_BYTES,
  MAX_RPC_FRAME_DEPTH,
} from "./rpc/constants/index.js";

// Validation
export type { RPCRequestLimits, RPCSchema } from "./rpc/validation/index.js";

export {
  assertValidProcedureName,
  assertValidRequest,
  measurePayloadBytes,
  toValidationIssues,
  parseInput,
  parseOutput,
} from "./rpc/validation/index.js";

// Errors
export type { RPCErrorOptions } from "./rpc/errors/index.js";

export {
  RPCError,
  RPCProcedureNotFoundError,
  RPCInvalidRequestError,
  RPCValidationError,
  RPCAuthenticationError,
  RPCForbiddenError,
  RPCTimeoutError,
  RPCCancelledError,
  RPCInternalError,
  RPCTransportError,
  RPCSerializationError,
  RPCDeserializationError,
  RPCUnavailableError,
  RPCRateLimitedError,
  RPCDeadlineExceededError,
  RPCDuplicateProcedureError,
  createRPCError,
  isRPCError,
} from "./rpc/errors/index.js";

// Procedures
export type {
  RPCHandler,
  RPCProcedure,
  RPCProcedureOptions,
} from "./rpc/procedure/index.js";

export { createRPCProcedure } from "./rpc/procedure/index.js";

export {
  RPCProcedureRegistry,
  RPCProcedureRouter,
} from "./rpc/procedure/index.js";

// Context
export type {
  RPCAuthContext,
  RPCContext,
  RPCContextOptions,
} from "./rpc/context/index.js";

export { createRPCContext } from "./rpc/context/index.js";

// Middleware
export type { RPCMiddleware } from "./rpc/middleware/index.js";

export { RPCMiddlewareStack } from "./rpc/middleware/index.js";

// Dispatcher
export type { RPCDispatcherOptions } from "./rpc/dispatcher/index.js";

export { RPCDispatcher } from "./rpc/dispatcher/index.js";

// Server, transports (in-memory and HTTP) and client — every export of
// these barrels is public.
export * from "./rpc/server/index.js";

export * from "./rpc/transport/index.js";

export * from "./rpc/client/index.js";

// Reliability
export {
  createTimeout,
  withTimeout,
  runWithTimeout,
  getRemainingTime,
  isDeadlineExceeded,
  throwIfDeadlineExceeded,
  readDeadline,
  createCancellableSignal,
  cancelSignal,
  throwIfCancelled,
  combineSignals,
  DEFAULT_RETRY_OPTIONS,
  calculateRetryDelay,
  retry,
} from "./rpc/reliability/index.js";

export type {
  RPCBackoff,
  RPCJitter,
  RPCRetryOptions,
  CancellableSignal,
} from "./rpc/reliability/index.js";

// Interceptors
export type { RPCInterceptor } from "./rpc/interceptor/index.js";

export { createNoopRPCInterceptor } from "./rpc/interceptor/index.js";

// Streaming
export type {
  RPCStreamingHandler,
  RPCStreamingProcedure,
} from "./rpc/streaming/index.js";

export { createRPCStreamingProcedure } from "./rpc/streaming/index.js";
