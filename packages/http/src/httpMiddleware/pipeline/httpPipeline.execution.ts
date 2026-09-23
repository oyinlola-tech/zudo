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

import { HttpMiddlewareError } from "../httpMiddleware.error.js";

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

    /*
     * A failure propagates as the error that was thrown, never a wrapper and
     * never swallowed. An outer middleware's `await next()` rejects with it,
     * so code after `await next()` does not run unless that middleware
     * catches it (`try/catch`, `try/finally`), and `instanceof NotFoundError`
     * works there and in the server's `errorHandler`. It used to be wrapped
     * in `HttpMiddlewareError` here and `HttpMiddlewarePipelineError` below,
     * which hid the original in `cause` / `errors[0].cause`.
     */
    const result = await entry.middleware(context, next);

    return normalizeResult(result, response);
  };

  try {
    return await dispatch(0);
  } catch (error) {
    if (!pipelineOptions.onError) {
      throw error;
    }

    /*
     * A successful `onError` is a genuine recovery and is returned. If the
     * handler throws, what it threw propagates: rethrowing the error it was
     * given passes that original on, and throwing a translated error (a
     * `NotFoundError` for a missing row) replaces it.
     */
    const errorResult = await pipelineOptions.onError(error, context);

    return normalizeResult(errorResult, response);
  }
}
