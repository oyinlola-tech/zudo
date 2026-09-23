import type { RPCRequest } from "../types/rpcRequest.type.js";

import type { RPCResponse } from "../types/rpcResponse.type.js";

import type { RPCProcedure } from "../procedure/rpcProcedure.type.js";

import { RPCProcedureRegistry } from "../procedure/rpcProcedureRegistry.core.js";

import { RPCMiddlewareStack } from "../middleware/rpcMiddleware.core.js";

import { RPCDispatcher } from "../dispatcher/rpcDispatcher.core.js";

import type { RPCContextOptions } from "../context/rpcContext.type.js";
import type { RPCDispatcherOptions } from "../dispatcher/rpcDispatcher.core.js";

import { createRPCErrorResponse } from "../types/rpcResponse.type.js";

import { MAX_RPC_REQUEST_ID_LENGTH } from "../constants/rpcConstants.core.js";

import { assertValidRequest } from "../validation/rpcValidation.core.js";
import type { RPCRequestLimits } from "../validation/rpcValidation.core.js";

import { mapRPCError } from "./rpcErrorMapping.helper.js";

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
   *
   * Everything in `request` comes from that peer, including
   * `request.metadata.userId`. Identity the transport has verified goes
   * in `trusted.auth` and reaches middleware and handlers as
   * `context.auth`; authorise on that, never on frame metadata.
   */
  async handle(
    request: RPCRequest,
    trusted: RPCContextOptions = {},
  ): Promise<RPCResponse> {
    // An id the validator would refuse is never reflected: the error
    // response below echoes this value, so accepting an over-long id here
    // would amplify it straight back to the peer that sent it.
    const rawId = (request as { id?: unknown } | undefined)?.id;
    const maxIdLength =
      this.options.limits?.maxRequestIdLength ?? MAX_RPC_REQUEST_ID_LENGTH;
    const requestId =
      typeof rawId === "string" &&
      (maxIdLength <= 0 || rawId.length <= maxIdLength)
        ? rawId
        : "";

    try {
      assertValidRequest(request, this.options.limits);

      // `metadata` is optional on the wire (`createRPCRequest` fills it in,
      // a hand-built or JSON-decoded frame need not). Every consumer below
      // reads it as an object, so a frame without it used to fail with a
      // TypeError reported as an internal error.
      const frame: RPCRequest =
        request.metadata === undefined ? { ...request, metadata: {} } : request;

      return await this.dispatcher.dispatch(frame, trusted);
    } catch (error) {
      const mapped = mapRPCError(error);

      if (mapped.internal) {
        // Internal detail goes to the log, never the wire: the caller is
        // an untrusted peer and exception text can name hosts, paths,
        // credentials or queries.
        this.options.onInternalError?.(error, requestId);
      }

      return createRPCErrorResponse(requestId, mapped.payload);
    }
  }

  /**
   * Returns the procedure registry.
   */
  getRegistry(): RPCProcedureRegistry {
    return this.registry;
  }
}
