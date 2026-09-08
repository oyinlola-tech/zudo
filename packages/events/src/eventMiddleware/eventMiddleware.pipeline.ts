/**
 * Event middleware pipeline execution for Zudojs.
 */

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

import {
  sortEventMiddleware,
  executeEventMiddleware,
} from "./eventMiddleware.helper.js";

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

  const activeMiddleware = sortEventMiddleware(
    middleware.filter((item) => item.enabled),
  );

  const executions: EventMiddlewareExecution<TResult>[] = [];

  let index = -1;

  const dispatch = async (currentIndex: number): Promise<TResult> => {
    if (context.signal.aborted) {
      throw createAbortError(context);
    }

    if (currentIndex === activeMiddleware.length) {
      return terminal();
    }

    if (currentIndex <= index) {
      throw new EventMiddlewareError(
        "Event middleware called next() more than once.",
        {
          eventType: context.event?.type,
          eventId: context.event?.id,
        },
      );
    }

    index = currentIndex;

    const current = activeMiddleware[currentIndex];

    if (!current) {
      return terminal();
    }

    const middlewareStarted = performance.now();

    let nextCalled = false;

    /**
     * Errors that surfaced through next() belong to downstream
     * code, not to this middleware; they must pass through
     * unwrapped.
     */
    let downstreamThrew = false;

    let downstreamError: unknown;

    const next = async () => {
      if (nextCalled) {
        throw new EventMiddlewareError(
          `Middleware "${current.id}" called next() more than once.`,
          {
            middlewareId: current.id,

            eventType: context.event?.type,
            eventId: context.event?.id,
          },
        );
      }

      nextCalled = true;

      try {
        return await dispatch(currentIndex + 1);
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
      if (downstreamThrew && error === downstreamError) {
        throw error;
      }

      if (
        error instanceof EventMiddlewareError ||
        error instanceof EventDispatchAbortedError
      ) {
        throw error;
      }

      throw new EventMiddlewareError(
        `Event middleware "${current.id}" failed.`,
        {
          middlewareId: current.id,

          eventType: context.event?.type,
          eventId: context.event?.id,

          cause: toEventError(error, {
            eventType: context.event?.type,
            eventId: context.event?.id,
          }),
        },
      );
    }
  };

  const result = await dispatch(0);

  return {
    result,

    executions,

    duration: performance.now() - started,
  };
}

/**
 * Creates the abort error thrown when the pipeline observes an
 * aborted signal.
 */
function createAbortError(
  context: EventMiddlewareContext<Event>,
): EventDispatchAbortedError {
  return new EventDispatchAbortedError("Event dispatch was aborted.", {
    eventType: context.event?.type,
    eventId: context.event?.id,
  });
}
