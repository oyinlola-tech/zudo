/**
 * Event middleware pipeline execution for Zudojs, built on `compose` from
 * `@zudojs/middleware`.
 */

import { compose, type Middleware } from "@zudojs/middleware";

import type { Event } from "../eventTypes/eventDefinition.type.js";

import {
  EventDispatchAbortedError,
  EventMiddlewareError,
  toEventError,
} from "../eventErrors/eventError.base.js";

import type {
  EventMiddlewareContext,
  EventMiddlewareNext,
  RegisteredEventMiddleware,
  EventMiddlewareExecution,
  EventMiddlewarePipelineResult,
} from "./eventMiddleware.type.js";

import { sortEventMiddleware, executeEventMiddleware } from "./eventMiddleware.helper.js";

/**
 * Executes a middleware pipeline.
 *
 * Middleware executes in descending priority order:
 *
 * middleware A
 *   → middleware B
 *     → handler
 *   ← middleware B
 * ← middleware A
 *
 * Only errors thrown by a middleware function itself are wrapped
 * in EventMiddlewareError. Errors coming back through next() —
 * handler failures, aborts, downstream middleware errors — are
 * re-thrown untouched so callers can discriminate them.
 */
export async function executeEventMiddlewarePipeline<
  TEvent extends Event,
  TResult,
>(
  middleware: readonly RegisteredEventMiddleware<TEvent, TResult>[],
  context: EventMiddlewareContext<TEvent>,
  terminal: EventMiddlewareNext<TResult>,
): Promise<EventMiddlewarePipelineResult<TResult>> {
  const started = performance.now();

  const executions: EventMiddlewareExecution<TResult>[] = [];

  const stages = sortEventMiddleware(middleware.filter((item) => item.enabled))
    .map((current) => toStage(current, executions));

  const run = compose<EventMiddlewareContext<TEvent>, TResult>(
    stages,
    async (ctx) => {
      throwIfAborted(ctx);
      return terminal();
    },
    { maxDepth: Number.POSITIVE_INFINITY },
  );

  const result = await run(context);

  return { result, executions, duration: performance.now() - started };
}

/**
 * Adapts one registered middleware to the shared composer: checks the
 * abort signal, rejects a second next() with an EventMiddlewareError,
 * records the execution, and wraps only the middleware's own errors.
 */
function toStage<TEvent extends Event, TResult>(
  current: RegisteredEventMiddleware<TEvent, TResult>,
  executions: EventMiddlewareExecution<TResult>[],
): Middleware<EventMiddlewareContext<TEvent>, TResult> {
  return async (context, advance) => {
    throwIfAborted(context);

    const middlewareStarted = performance.now();
    const eventType = context.event?.type;
    const eventId = context.event?.id;

    let nextCalled = false;
    let downstreamThrew = false;
    let downstreamError: unknown;

    const next = async (): Promise<TResult> => {
      if (nextCalled) {
        throw new EventMiddlewareError(
          `Middleware "${current.id}" called next() more than once.`,
          { middlewareId: current.id, eventType, eventId },
        );
      }
      nextCalled = true;
      try {
        return await advance();
      } catch (error) {
        downstreamThrew = true;
        downstreamError = error;
        throw error;
      }
    };

    try {
      const result = await executeEventMiddleware(
        current.middleware,
        context,
        next,
      );
      executions.push({
        middlewareId: current.id,
        result,
        duration: performance.now() - middlewareStarted,
      });
      return result;
    } catch (error) {
      if (
        (downstreamThrew && error === downstreamError) ||
        error instanceof EventMiddlewareError ||
        error instanceof EventDispatchAbortedError
      ) {
        throw error;
      }
      throw new EventMiddlewareError(`Event middleware "${current.id}" failed.`, {
        middlewareId: current.id,
        eventType,
        eventId,
        cause: toEventError(error, { eventType, eventId }),
      });
    }
  };
}

/**
 * Throws the abort error when the pipeline observes an aborted signal.
 */
function throwIfAborted(context: EventMiddlewareContext<Event>): void {
  if (context.signal.aborted) {
    throw new EventDispatchAbortedError("Event dispatch was aborted.", {
      eventType: context.event?.type,
      eventId: context.event?.id,
    });
  }
}
