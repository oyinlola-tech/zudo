/**
 * Message middleware composition and pipeline execution.
 *
 * @module messageMiddleware/messageMiddlewarePipeline
 */

import { compose } from "@zudojs/middleware";

import type {
  MessageMiddleware,
  MessageMiddlewareLike,
  MessageMiddlewareNext,
  MessageMiddlewareContext,
  MessageMiddlewarePipelineResult,
  MessageMiddlewarePipelineOptions,
  MessageMiddlewareExecution,
} from "./messageMiddlewareType.type.js";

import type {
  Message,
  MessageCorrelationId,
  MessageCausationId,
} from "../message/messageType.type.js";

/**
 * Resolves a MessageMiddlewareLike to a plain MessageMiddleware function.
 */
function resolveMiddlewareLike<TResult>(
  mw: MessageMiddlewareLike<Message, TResult>,
): MessageMiddleware<Message, TResult> {
  if (typeof mw === "function") {
    return mw;
  }
  return mw.handle.bind(mw);
}

/**
 * Runs a handler through a middleware pipeline and returns the
 * result with execution metadata.
 */
export async function runMessagePipeline<TResult>(
  middlewareList: readonly MessageMiddlewareLike<Message, TResult>[],
  handler: (
    message: Message,
    context: MessageMiddlewareContext<Message>,
  ) => Promise<TResult>,
  message: Message,
  options: MessageMiddlewarePipelineOptions = {},
): Promise<MessageMiddlewarePipelineResult<TResult>> {
  const executionId = `exec:${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const startedAt = new Date();
  const signal = options.signal ?? new AbortController().signal;
  const metadata = options.metadata ?? {};
  const state = options.state ?? new Map<string, unknown>();

  const executions: MessageMiddlewareExecution[] = [];

  const resolvedMiddleware = middlewareList.map((mw, index) => {
    const resolved = resolveMiddlewareLike(mw);
    // Each record now names the middleware it belongs to and carries what
    // that middleware returned. Both used to be wrong: every record was
    // labelled with the pipeline's own execution id, and `result` was pushed
    // from a `finally` block that could only ever see `undefined`.
    const middlewareId = options.middlewareIds?.[index] ?? `${executionId}#${index}`;
    return async (
      ctx: MessageMiddlewareContext<Message>,
      next: MessageMiddlewareNext<TResult>,
    ): Promise<TResult> => {
      const mwStart = performance.now();
      try {
        const result = await resolved(ctx, next);
        executions.push({
          middlewareId,
          result,
          duration: performance.now() - mwStart,
        });
        return result;
      } catch (error) {
        executions.push({
          middlewareId,
          result: undefined as unknown,
          duration: performance.now() - mwStart,
        });
        throw error;
      }
    };
  });

  const pipelineStart = performance.now();

  // Unbounded depth: the list length is fixed by the registered middleware.
  const composed = compose<MessageMiddlewareContext<Message>, TResult>(
    resolvedMiddleware,
    async (ctx) => handler(message, ctx),
    { maxDepth: Number.POSITIVE_INFINITY },
  );

  const context: MessageMiddlewareContext<Message> = {
    message,
    context: options.context ?? {
      message,
      correlationId:
        message.correlationId ??
        (message.id as unknown as MessageCorrelationId),
      causationId:
        message.causationId ?? (message.id as unknown as MessageCausationId),
      headers: Object.freeze({ ...metadata }),
      signal,
      state,
      startedAt,
    },
    signal,
    metadata,
    executionId,
    startedAt,
    state,
  };

  const result = await composed(context);

  return {
    result,
    executions,
    duration: performance.now() - pipelineStart,
  };
}
