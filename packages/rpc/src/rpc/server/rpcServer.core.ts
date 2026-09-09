import type { RPCRequest } from "../types/rpcRequest.type.js";

import type { RPCResponse } from "../types/rpcResponse.type.js";

import type { RPCProcedure } from "../procedure/rpcProcedure.type.js";

import { RPCProcedureRegistry } from "../procedure/rpcProcedureRegistry.core.js";

import { RPCMiddlewareStack } from "../middleware/rpcMiddleware.core.js";

import { RPCDispatcher } from "../dispatcher/rpcDispatcher.core.js";
import type { RPCDispatcherOptions } from "../dispatcher/rpcDispatcher.core.js";

import { createRPCErrorResponse } from "../types/rpcResponse.type.js";

import {
  isRPCError,
  RPCAuthenticationError,
  RPCCancelledError,
  RPCDeadlineExceededError,
  RPCDeserializationError,
  RPCForbiddenError,
  RPCInvalidRequestError,
  RPCProcedureNotFoundError,
  RPCRateLimitedError,
  RPCSerializationError,
  RPCTimeoutError,
  RPCUnavailableError,
  RPCValidationError,
} from "../errors/rpc.errors.js";

import { INTERNAL_ERROR_MESSAGE } from "../constants/rpcConstants.core.js";

import { assertValidRequest } from "../validation/rpcValidation.core.js";
import type { RPCRequestLimits } from "../validation/rpcValidation.core.js";

/**
 * Wire codes for the error types the server maps.
 *
 * Ordered most specific first; every entry is a type a caller can act
 * on, which is why they must not be collapsed into a generic internal
 * error.
 */
const ERROR_CODES: ReadonlyArray<
  readonly [new (...args: never[]) => Error, string]
> = [
  [RPCProcedureNotFoundError, "RPC_PROCEDURE_NOT_FOUND"],
  [RPCValidationError, "RPC_VALIDATION_ERROR"],
  [RPCInvalidRequestError, "RPC_INVALID_REQUEST"],
  [RPCAuthenticationError, "RPC_UNAUTHENTICATED"],
  [RPCForbiddenError, "RPC_FORBIDDEN"],
  [RPCRateLimitedError, "RPC_RATE_LIMITED"],
  [RPCDeadlineExceededError, "RPC_DEADLINE_EXCEEDED"],
  [RPCTimeoutError, "RPC_TIMEOUT"],
  [RPCCancelledError, "RPC_CANCELLED"],
  [RPCUnavailableError, "RPC_UNAVAILABLE"],
  [RPCSerializationError, "RPC_SERIALIZATION_ERROR"],
  [RPCDeserializationError, "RPC_DESERIALIZATION_ERROR"],
];

/**
 * Options for an RPC server.
 */
export interface RPCServerOptions {
  /** Limits applied to every incoming request before dispatch. */
  readonly limits?: RPCRequestLimits;
  /** Dispatch behaviour: default timeout and deadline handling. */
  readonly dispatch?: RPCDispatcherOptions;
  /**
   * Receives errors that produced an internal error response, together
   * with the request id the caller was given. Internal error detail is
   * never returned over the wire, so this is where it must be recorded
   * for the failure to be diagnosable.
   */
  readonly onInternalError?: (error: unknown, requestId: string) => void;
}

/**
 * RPC server that receives and dispatches requests.
 */
export class RPCServer {
  private readonly registry: RPCProcedureRegistry;

  private readonly middleware: RPCMiddlewareStack;

  private readonly dispatcher: RPCDispatcher;

  private readonly options: RPCServerOptions;

  constructor(
    registry?: RPCProcedureRegistry,
    middleware?: RPCMiddlewareStack,
    options: RPCServerOptions = {},
  ) {
    this.registry = registry ?? new RPCProcedureRegistry();
    this.middleware = middleware ?? new RPCMiddlewareStack();
    this.options = options;
    this.dispatcher = new RPCDispatcher(
      this.registry,
      this.middleware,
      options.dispatch ?? {},
    );
  }

  /**
   * Registers a procedure.
   *
   * Generic over the procedure's input and output so a procedure built
   * with `createRPCProcedure<TInput, TOutput>` can be registered
   * directly. `RPCProcedure` is contravariant in `TInput` (its handler
   * accepts that input), so a typed procedure is NOT assignable to
   * `RPCProcedure<unknown>` and a non-generic signature would reject
   * every typed procedure. Decoding stays a runtime concern.
   */
  register<TInput = unknown, TOutput = unknown>(
    procedure: RPCProcedure<TInput, TOutput>,
  ): this {
    this.registry.register(procedure);
    return this;
  }

  /**
   * Handles an incoming RPC request.
   *
   * The frame is validated before dispatch, and every failure is mapped
   * to a typed wire code. Unexpected errors are reported to
   * `onInternalError` and answered with a fixed message: internal
   * exception text can name hosts, paths, credentials or queries, and
   * the caller is an untrusted peer.
   */
  async handle(request: RPCRequest): Promise<RPCResponse> {
    const requestId =
      typeof (request as { id?: unknown } | undefined)?.id === "string"
        ? request.id
        : "";

    try {
      assertValidRequest(request, this.options.limits);

      return await this.dispatcher.dispatch(request);
    } catch (error) {
      const mapped = this.mapError(error);

      if (mapped === undefined) {
        this.options.onInternalError?.(error, requestId);

        return createRPCErrorResponse(requestId, {
          code: "RPC_INTERNAL_ERROR",
          message: INTERNAL_ERROR_MESSAGE,
        });
      }

      return createRPCErrorResponse(requestId, mapped);
    }
  }

  /**
   * Returns the procedure registry.
   */
  getRegistry(): RPCProcedureRegistry {
    return this.registry;
  }

  /**
   * Maps a known error onto a wire payload.
   *
   * Returns `undefined` for anything unrecognised, which the caller
   * answers with a generic internal error.
   */
  private mapError(
    error: unknown,
  ): { code: string; message: string; details?: unknown } | undefined {
    for (const [type, code] of ERROR_CODES) {
      if (error instanceof type) {
        const payload: { code: string; message: string; details?: unknown } = {
          code,
          message: error.message,
        };

        if (error instanceof RPCValidationError && error.issues !== undefined) {
          payload.details = error.issues;
        }

        if (
          error instanceof RPCRateLimitedError &&
          error.retryAfter !== undefined
        ) {
          payload.details = { retryAfter: error.retryAfter };
        }

        return payload;
      }
    }

    // A custom RPCError subclass is still a deliberate, caller-facing
    // error; honour its own code rather than hiding it.
    if (isRPCError(error)) {
      return { code: error.code, message: error.message };
    }

    return undefined;
  }
}
