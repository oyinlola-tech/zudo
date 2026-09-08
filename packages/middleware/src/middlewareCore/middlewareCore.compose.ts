/**
 * Compose multiple middleware functions into a single handler.
 *
 * @module middlewareCore/middlewareCore
 *
 * Middleware executes in order (first added = first executed).
 * Each middleware calls `next()` to proceed to the next one.
 */

import type {
  Middleware,
  NamedMiddleware,
} from "../middlewareTypes/middlewareDefinition.type.js";
import {
  MiddlewareDepthExceededError,
  MiddlewareNextCalledMultipleTimesError,
} from "../middlewareErrors/middlewareError.base.js";

/** Default ceiling on how deeply a composed chain may nest. */
export const MAX_DEPTH = 100;

/** Options for {@link compose}. */
export interface ComposeOptions {
  /** Maximum chain depth. Default: {@link MAX_DEPTH}. */
  readonly maxDepth?: number;
}

/**
 * Compose an array of middleware into a single function.
 *
 * The returned function executes middleware in order.
 * If no middleware is provided, the handler is called directly.
 *
 * @param middlewareList - Array of middleware functions
 * @param handler - The final handler to execute after all middleware
 * @param options - Composition limits
 * @returns Composed function
 * @throws MiddlewareDepthExceededError if the chain is longer than `maxDepth`
 */
export function compose<TContext, TResult>(
  middlewareList: readonly Middleware<TContext, TResult>[],
  handler: (context: TContext) => Promise<TResult>,
  options?: ComposeOptions,
): (context: TContext) => Promise<TResult> {
  const maxDepth = options?.maxDepth ?? MAX_DEPTH;

  if (middlewareList.length > maxDepth) {
    throw new MiddlewareDepthExceededError(maxDepth);
  }

  if (middlewareList.length === 0) {
    return handler;
  }

  return async (context: TContext): Promise<TResult> => {
    let index = -1;

    async function dispatch(i: number): Promise<TResult> {
      if (i <= index) {
        // dispatch(i) is invoked by the middleware at i - 1, so that is the
        // one that called next() again.
        throw new MiddlewareNextCalledMultipleTimesError(
          `middleware[${i - 1}]`,
        );
      }
      if (i > maxDepth) {
        throw new MiddlewareDepthExceededError(maxDepth);
      }
      index = i;

      if (i < middlewareList.length) {
        const mw = middlewareList[i]!;
        return mw(context, () => dispatch(i + 1));
      }
      return handler(context);
    }

    return dispatch(0);
  };
}

/**
 * Filter disabled middleware and sort the rest by priority.
 *
 * Ordering is stable, so middleware sharing a priority keeps its input order.
 *
 * @param middlewareList - Array of named middleware
 * @returns Enabled middleware, in execution order, with names intact
 */
export function resolveNamedMiddleware<TContext, TResult>(
  middlewareList: readonly NamedMiddleware<TContext, TResult>[],
): NamedMiddleware<TContext, TResult>[] {
  return middlewareList
    .filter((mw) => mw.enabled !== false)
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

/**
 * Sort and filter named middleware by priority, returning bare handlers.
 *
 * Prefer {@link resolveNamedMiddleware} when the names are needed — this is a
 * thin projection of it.
 *
 * @param middlewareList - Array of named middleware
 * @returns Sorted and filtered array of middleware handler functions
 */
export function resolveMiddleware<TContext, TResult>(
  middlewareList: readonly NamedMiddleware<TContext, TResult>[],
): Middleware<TContext, TResult>[] {
  return resolveNamedMiddleware(middlewareList).map((mw) => mw.handler);
}

/** Options for {@link withTiming}. */
export interface TimingOptions {
  /** Log only when the middleware takes at least this long. Default: 100ms. */
  readonly thresholdMs?: number;
  /** Where to report slow middleware. Default: `console.warn`. */
  readonly logger?: (message: string) => void;
}

/**
 * Wrap a middleware so that slow executions are reported.
 *
 * The wrapper is transparent: the inner middleware's return value and any
 * error it throws pass through unchanged, and the timing is reported either
 * way.
 */
export function withTiming<TContext, TResult = void>(
  name: string,
  middleware: Middleware<TContext, TResult>,
  options?: TimingOptions,
): NamedMiddleware<TContext, TResult> {
  const thresholdMs = options?.thresholdMs ?? 100;
  const log =
    options?.logger ??
    ((message: string) => {
      console.warn(message);
    });

  return {
    name,
    handler: async (ctx, next) => {
      const start = performance.now();
      try {
        return await middleware(ctx, next);
      } finally {
        const duration = performance.now() - start;
        if (duration >= thresholdMs) {
          log(`[middleware] ${name} took ${duration.toFixed(1)}ms`);
        }
      }
    },
  };
}
