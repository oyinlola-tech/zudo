/**
 * Middleware pipeline execution logic.
 *
 * @module httpMiddleware/pipeline/execution
 */

import type {
  HttpMiddlewareContext,
  HttpMiddlewareErrorHandler,
  HttpMiddlewareState,
  InternalMiddleware,
} from "../httpMiddleware.type.js";

import type { HttpRequestContext as RequestContext } from "../../httpRequest/httpRequest.context.js";

import type { HttpResponseContext as ResponseContext } from "../../httpResponse/httpResponse.context.js";

import {
  HttpMiddlewareError,
  HttpMiddlewarePipelineError,
} from "../httpMiddleware.error.js";

import { normalizeResult } from "./httpPipeline.helper.js";

import { list } from "./httpPipeline.registration.js";

export interface PipelineExecutionOptions {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly onError: HttpMiddlewareErrorHandler | undefined;
}

export async function executePipeline(
  entries: InternalMiddleware[],
  request: RequestContext,
  response: ResponseContext,
  options: {
    readonly state?: HttpMiddlewareState;
    readonly signal?: AbortSignal;
    readonly metadata?: Readonly<Record<string, unknown>>;
  } = {},
  pipelineOptions: PipelineExecutionOptions,
): Promise<ResponseContext> {
  const middlewares = list(entries);

  const context: HttpMiddlewareContext = {
    request,
    response,
    state: options.state ?? (new Map() as unknown as HttpMiddlewareState),
    signal: options.signal ?? new AbortController().signal,
    metadata: Object.freeze({
      ...pipelineOptions.metadata,
      ...(options.metadata ?? {}),
    }),
  };

  const dispatch = async (index: number): Promise<ResponseContext> => {
    if (index >= middlewares.length) {
      return response;
    }

    const entry = middlewares[index];

    if (!entry) {
      return response;
    }

    let nextCalls = 0;

    const next = (): Promise<ResponseContext> => {
      nextCalls += 1;

      if (nextCalls > 1) {
        /*
         * Calling `next()` twice runs the rest of the chain twice against one
         * request: duplicated side effects, and a second attempt to write a
         * response whose headers are already sent.
         */
        return Promise.reject(
          new HttpMiddlewareError(
            `Middleware "${entry.name}" called next() more than once.`,
            {
              middlewareId: entry.id,
              middlewareName: entry.name,
            },
          ),
        );
      }

      return dispatch(index + 1);
    };

    try {
      const result = await entry.middleware(context, next);

      return normalizeResult(result, response);
    } catch (error) {
      /*
       * Rethrow rather than returning the untouched response. Swallowing here
       * let an inner failure resume the *outer* frames, so middleware that
       * runs after `await next()` — access logging, CORS and security header
       * emission, audit commits — executed against a response that was about
       * to be discarded, and recorded the request as a success.
       */
      throw error instanceof HttpMiddlewareError
        ? error
        : new HttpMiddlewareError(
            `Middleware "${entry.name}" threw an error.`,
            {
              middlewareId: entry.id,
              middlewareName: entry.name,
              cause: error,
            },
          );
    }
  };

  try {
    return await dispatch(0);
  } catch (error) {
    const middlewareError =
      error instanceof HttpMiddlewareError
        ? error
        : new HttpMiddlewareError("HTTP middleware pipeline failed.", {
            cause: error,
          });

    if (pipelineOptions.onError) {
      try {
        /*
         * A successful `onError` is a genuine recovery and must be returned.
         * Previously every caught error was recorded before `onError` ran and
         * the recorded list was rethrown afterwards, so the handler's result
         * was always discarded and the option could never take effect.
         */
        const errorResult = await pipelineOptions.onError(
          middlewareError.cause ?? error,
          context,
        );

        return normalizeResult(errorResult, response);
      } catch (handlerError) {
        /* The handler's own failure is reported, not swallowed. */
        throw new HttpMiddlewarePipelineError([
          middlewareError,
          new HttpMiddlewareError(
            "HTTP middleware error handler threw an error.",
            { cause: handlerError },
          ),
        ]);
      }
    }

    throw new HttpMiddlewarePipelineError([middlewareError]);
  }
}
