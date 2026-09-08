import type { APIContext } from "../context/context.type.js";

import type { APIResult } from "../result/apiResult.type.js";

import type { APIOperation } from "../operation/operation.type.js";

/**
 * Execution context passed through the interceptor pipeline.
 */
export interface APIExecutionContext<TInput = unknown, TOutput = unknown> {
  readonly operation: APIOperation<TInput, TOutput>;

  readonly input: TInput;

  readonly context: APIContext;

  /**
   * The operation result. Populated by the executor once the handler has
   * run, so interceptor code after `await next()` can read it here as
   * well as from `next()`'s return value.
   */
  readonly result?: APIResult<TOutput>;
}

/**
 * Interceptor that wraps operation execution.
 *
 * Interceptors form a pipeline around the handler execution.
 */
export interface APIInterceptor {
  intercept<TInput = unknown, TOutput = unknown>(
    context: APIExecutionContext<TInput, TOutput>,
    next: () => Promise<APIResult<TOutput>>,
  ): Promise<APIResult<TOutput>>;
}

/**
 * Creates a no-op interceptor.
 */
export function createNoopInterceptor(): APIInterceptor {
  return {
    async intercept(_context, next) {
      return next();
    },
  };
}
