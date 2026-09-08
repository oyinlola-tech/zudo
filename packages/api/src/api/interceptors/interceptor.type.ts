import type { APIContext } from "../context/context.type.js";

import type { APIResult } from "../result/apiResult.type.js";

import type { APIOperation } from "../operation/operation.type.js";

/**
 * Execution context passed through the interceptor pipeline.
 */
export interface APIExecutionContext<TInput = unknown, TOutput = unknown> {
  readonly operation: APIOperation<TInput, TOutput>;

  /**
   * The input the handler will receive.
   *
   * Writable on purpose: an interceptor may replace it before calling
   * `next()` (to sanitize, scope to a tenant, or apply a default) and the
   * handler receives the replacement. The executor reads this field at
   * handler-invocation time, so a replacement made by any interceptor in
   * the chain takes effect.
   */
  input: TInput;

  readonly context: APIContext;

  /**
   * The result produced by the level below this one.
   *
   * The executor assigns it as each pipeline level resolves, so after
   * `await next()` this holds exactly what `next()` returned — including
   * when a downstream interceptor short-circuits without running the
   * handler. It is `undefined` before `next()` has resolved.
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
