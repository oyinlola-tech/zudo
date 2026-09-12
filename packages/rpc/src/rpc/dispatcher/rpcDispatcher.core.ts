import type { RPCRequest } from "../types/rpcRequest.type.js";

import type { RPCResponse } from "../types/rpcResponse.type.js";

import type { RPCProcedure } from "../procedure/rpcProcedure.type.js";

import type { RPCMiddlewareStack } from "../middleware/rpcMiddleware.core.js";

import type { RPCInterceptor } from "../interceptor/rpcInterceptor.type.js";

import type { RPCContext } from "../context/rpcContext.type.js";

import { createRPCContext } from "../context/rpcContext.type.js";

import { createRPCResponse } from "../types/rpcResponse.type.js";

import { RPCCancelledError } from "../errors/rpc.errors.js";

import { DEFAULT_RPC_TIMEOUT } from "../constants/rpcConstants.core.js";

import { parseInput, parseOutput } from "../validation/rpcValidation.core.js";

import {
  readDeadline,
  throwIfDeadlineExceeded,
} from "../reliability/deadline/rpcDeadline.helper.js";

import { createTimeout } from "../reliability/timeout/rpcTimeout.helper.js";

/**
 * Options controlling dispatch.
 */
export interface RPCDispatcherOptions {
  /**
   * Timeout applied to a procedure that declares none, in milliseconds.
   * Defaults to {@link DEFAULT_RPC_TIMEOUT}. Set to `0` to leave
   * procedures without their own timeout unbounded.
   */
  readonly defaultTimeout?: number;
  /**
   * Whether a `deadline` in request metadata caps the effective timeout.
   * Defaults to `true`.
   */
  readonly honourDeadline?: boolean;
  /**
   * Interceptors wrapping every dispatch, outermost first.
   *
   * They run around the middleware stack and the handler, so an
   * interceptor observes validation and middleware as part of the call
   * it wraps.
   */
  readonly interceptors?: readonly RPCInterceptor[];
}

/**
 * Dispatches RPC requests to registered procedures.
 *
 * Every dispatch runs under a real `AbortController`, a bounded timeout,
 * and — when the procedure declares schemas — input and output
 * validation. Errors keep their identity: an `RPCError` thrown by a
 * middleware or handler propagates unchanged so the server can map it to
 * the right response code, and only genuinely unexpected errors are
 * wrapped.
 */
export class RPCDispatcher {
  private readonly registry: {
    require(name: string): RPCProcedure;
  };

  private readonly middleware: RPCMiddlewareStack;

  private readonly options: RPCDispatcherOptions;

  constructor(
    registry: { require(name: string): RPCProcedure },
    middleware: RPCMiddlewareStack,
    options: RPCDispatcherOptions = {},
  ) {
    this.registry = registry;
    this.middleware = middleware;
    this.options = options;
  }

  /**
   * Dispatches an RPC request.
   */
  async dispatch(input: RPCRequest): Promise<RPCResponse> {
    // Tolerate a frame without `metadata`: the field is optional when a
    // request is built by hand or decoded from JSON, and everything below
    // — deadline reading, the context's `metadata` — reads it as an object.
    const request: RPCRequest =
      input.metadata === undefined ? { ...input, metadata: {} } : input;

    const procedure = this.registry.require(request.procedure);

    const controller = new AbortController();
    const context = createRPCContext(request, controller.signal);

    const timeoutMs = this.resolveTimeout(request, procedure);

    // A deadline already in the past is rejected before any work runs.
    if (this.options.honourDeadline ?? true) {
      const deadline = readDeadline(request.metadata);
      if (deadline !== undefined) {
        throwIfDeadlineExceeded(deadline, request.procedure);
      }
    }

    const timeout =
      timeoutMs > 0 ? createTimeout(timeoutMs, request.procedure) : undefined;

    try {
      const run = async (): Promise<unknown> => {
        const input = procedure.options?.input
          ? parseInput(
              procedure.options.input,
              request.payload,
              request.procedure,
            )
          : request.payload;

        const result = await this.middleware.execute(context, async () => {
          return procedure.handler(input, context);
        });

        return procedure.options?.output
          ? parseOutput(procedure.options.output, result, request.procedure)
          : result;
      };

      const invoke = (): Promise<unknown> =>
        this.applyInterceptors(context, run);

      const result =
        timeout === undefined
          ? await invoke()
          : await Promise.race([
              invoke(),
              timeout.promise.catch((error: unknown) => {
                // Abort first so a cooperative handler stops working
                // instead of running on with its result discarded.
                if (!controller.signal.aborted) {
                  controller.abort(error);
                }
                throw error;
              }),
            ]);

      return createRPCResponse(request.id, result);
    } finally {
      // Errors propagate unchanged. Rewriting them here is what turned
      // an auth failure or a rate limit into a generic internal fault;
      // the server owns the mapping from error type to response code.
      timeout?.cancel();

      if (!controller.signal.aborted) {
        // Release anything still listening on the request signal.
        controller.abort(
          new RPCCancelledError("Request completed.", request.procedure),
        );
      }
    }
  }

  /**
   * Runs the interceptor chain around the dispatch.
   *
   * Each interceptor may call `next()` once; a second call throws rather
   * than re-running the handler.
   */
  private async applyInterceptors(
    context: RPCContext,
    run: () => Promise<unknown>,
  ): Promise<unknown> {
    const interceptors = this.options.interceptors;

    if (!interceptors || interceptors.length === 0) {
      return run();
    }

    const called = new Set<number>();

    const runAt = async (index: number): Promise<unknown> => {
      if (called.has(index)) {
        throw new Error(
          `RPC interceptor at index ${index - 1} called next() more than once.`,
        );
      }
      called.add(index);

      if (index >= interceptors.length) {
        return run();
      }

      const interceptor = interceptors[index]!;
      return interceptor.intercept(context, () => runAt(index + 1));
    };

    return runAt(0);
  }

  /**
   * Resolves the timeout for a dispatch.
   *
   * A `deadline` in request metadata can only shorten the timeout, never
   * extend it past what the procedure allows.
   */
  private resolveTimeout(request: RPCRequest, procedure: RPCProcedure): number {
    const configured =
      procedure.options?.timeout ??
      this.options.defaultTimeout ??
      DEFAULT_RPC_TIMEOUT;

    if (configured <= 0) {
      return 0;
    }

    if (this.options.honourDeadline ?? true) {
      const deadline = readDeadline(request.metadata);
      if (deadline !== undefined) {
        return Math.max(1, Math.min(configured, deadline - Date.now()));
      }
    }

    return configured;
  }
}
