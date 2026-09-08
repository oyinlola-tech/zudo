/**
 * Middleware pipeline with execution tracking and result reporting.
 *
 * @module middlewarePipeline/middlewarePipeline
 */

import type {
  PipelineResult,
  PipelineOptions,
  PipelineErrorMode,
  PipelineMiddlewareFailure,
} from "../middlewareTypes/middlewareContext.type.js";
import type { NamedMiddleware } from "../middlewareTypes/middlewareDefinition.type.js";
import { resolveNamedMiddleware } from "../middlewareCore/middlewareCore.compose.js";
import {
  MiddlewareAbortedError,
  MiddlewareLimitExceededError,
  MiddlewareNextCalledMultipleTimesError,
} from "../middlewareErrors/middlewareError.base.js";

const DEFAULT_MAX = 50;

/** Name recorded for a failure thrown by the final handler. */
const HANDLER_NAME = "handler";

function resolveErrorMode(options?: PipelineOptions): PipelineErrorMode {
  if (options?.errorMode) return options.errorMode;
  if (options?.stopOnError === false) return "throw";
  return "capture";
}

/**
 * Create a middleware pipeline that tracks execution.
 *
 * @param middlewareList - Named middleware to include
 * @param handler - Final handler function
 * @param options - Pipeline configuration
 * @returns Pipeline execution function
 * @throws MiddlewareLimitExceededError if more middleware are enabled than
 * `maxMiddleware` allows
 */
export function createPipeline<TContext, TResult>(
  middlewareList: readonly NamedMiddleware<TContext, TResult>[],
  handler: (context: TContext) => Promise<TResult>,
  options?: PipelineOptions,
): (context: TContext) => Promise<PipelineResult<TResult>> {
  const resolved = resolveNamedMiddleware(middlewareList);
  const maxMiddleware = options?.maxMiddleware ?? DEFAULT_MAX;
  const errorMode = resolveErrorMode(options);
  const signal = options?.signal;

  if (resolved.length > maxMiddleware) {
    throw new MiddlewareLimitExceededError(resolved.length, maxMiddleware);
  }

  return async (context: TContext): Promise<PipelineResult<TResult>> => {
    const startTime = performance.now();
    const executed: string[] = [];
    const errors: PipelineMiddlewareFailure[] = [];
    let index = -1;

    /**
     * The error the final handler threw, if it did. Middleware still sees the
     * error itself — wrapping it would break `catch (e) { if (e instanceof
     * HttpError) … }` in user middleware — so identity is what marks it as
     * the handler's, and that is what stops `errorMode: "continue"` from
     * treating it as a middleware failure it can step past.
     */
    let handlerError: { readonly error: unknown } | undefined;

    function throwIfAborted(): void {
      if (signal?.aborted) {
        throw new MiddlewareAbortedError(signal.reason);
      }
    }

    /** Errors that `"continue"` must never swallow. */
    function isFatal(error: unknown): boolean {
      return (
        (handlerError !== undefined && error === handlerError.error) ||
        error instanceof MiddlewareAbortedError ||
        error instanceof MiddlewareNextCalledMultipleTimesError
      );
    }

    async function dispatch(i: number): Promise<TResult> {
      if (i <= index) {
        // dispatch(i) is invoked by the middleware at i - 1, so that is the
        // one that called next() again.
        const name = resolved[i - 1]?.name ?? `middleware[${i - 1}]`;
        throw new MiddlewareNextCalledMultipleTimesError(name);
      }
      index = i;
      throwIfAborted();

      if (i >= resolved.length) {
        try {
          return await handler(context);
        } catch (error) {
          handlerError = { error };
          throw error;
        }
      }

      const mw = resolved[i]!;
      executed.push(mw.name);

      if (errorMode !== "continue") {
        return mw.handler(context, () => dispatch(i + 1));
      }

      let advanced = false;
      let downstream: TResult | undefined;
      try {
        return await mw.handler(context, async () => {
          advanced = true;
          downstream = await dispatch(i + 1);
          return downstream;
        });
      } catch (error) {
        if (isFatal(error)) throw error;
        errors.push({ name: mw.name, error });
        // The chain already ran past this middleware, so its downstream
        // result stands; otherwise pick up at the next middleware.
        return advanced ? (downstream as TResult) : dispatch(i + 1);
      }
    }

    try {
      const result = await dispatch(0);
      return {
        success: true,
        result,
        durationMs: performance.now() - startTime,
        executedMiddleware: executed,
        errors,
      };
    } catch (error) {
      const fromHandler =
        handlerError !== undefined && error === handlerError.error;

      if (!errors.some((failure) => failure.error === error)) {
        errors.push({
          name: fromHandler ? HANDLER_NAME : (executed.at(-1) ?? HANDLER_NAME),
          error,
        });
      }

      if (errorMode === "throw") throw error;

      return {
        success: false,
        error,
        durationMs: performance.now() - startTime,
        executedMiddleware: executed,
        errors,
      };
    }
  };
}
