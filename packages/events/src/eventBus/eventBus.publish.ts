/**
 * Event bus publish methods for Zudojs.
 */

import type { Event, EventInput } from "../eventTypes/eventDefinition.type.js";

import { createEvent, isEvent } from "../eventTypes/eventDefinition.type.js";

import type { EventEmitter } from "../eventEmitter/eventEmitter.core.js";

import type { EventEmitResult } from "../eventEmitter/eventEmitter.type.js";

import type { EventRegistry } from "../eventRegistry/eventRegistry.store.js";

import {
  EventDispatchAbortedError,
  EventTypeNotFoundError,
  InvalidEventError,
} from "../eventErrors/eventError.base.js";

import type { RegisteredEventMiddleware } from "../eventMiddleware/eventMiddleware.type.js";

import { createEventMiddlewareContext } from "../eventMiddleware/eventMiddleware.helper.js";

import { executeEventMiddlewarePipeline } from "../eventMiddleware/eventMiddleware.pipeline.js";

import type {
  PublishOptions,
  EventPublishResult,
  EventBusEvent,
  EventBusErrorContext,
} from "./eventBus.type.js";

import { registerMiddlewareItem } from "./eventBus.registration.js";

/**
 * Dependencies the publish functions need from the bus.
 */
export interface BusPublishDependencies {
  readonly emitter: EventEmitter;
  readonly registry: EventRegistry;
  readonly busMiddleware: readonly RegisteredEventMiddleware[];
  readonly requireRegistration: boolean;
  readonly ensureUsable: () => void;
  readonly notify: (e: EventBusEvent) => void;
  readonly onError?: (error: unknown, context: EventBusErrorContext) => void;
}

/**
 * Determines whether a middleware pipeline result is the emit
 * result produced by the terminal handler dispatch.
 */
export function isEventEmitResult(value: unknown): value is EventEmitResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { handled?: unknown }).handled === "boolean" &&
    Array.isArray((value as { results?: unknown }).results) &&
    Array.isArray((value as { errors?: unknown }).errors)
  );
}

/**
 * Publishes an event through the bus.
 */
export async function busPublish<TEvent extends Event>(
  event: TEvent,
  options: PublishOptions,
  deps: BusPublishDependencies,
): Promise<EventPublishResult<TEvent>> {
  deps.ensureUsable();

  if (!isEvent(event)) {
    throw new InvalidEventError(
      "publish() requires an Event (use publishEvent() for event input).",
    );
  }

  if (options.signal?.aborted) {
    throw new EventDispatchAbortedError("Event dispatch was aborted.", {
      eventType: event.type,
      eventId: event.id,
    });
  }

  if (deps.requireRegistration && !deps.registry.has(event.type)) {
    throw new EventTypeNotFoundError(event.type);
  }

  const allMiddleware = [
    ...deps.busMiddleware,
    ...(options.middleware ?? []).map((m, index) =>
      registerMiddlewareItem(m, index, "publish-mw"),
    ),
  ];

  const middlewareContext = createEventMiddlewareContext(event, {
    signal: options.signal,
    metadata: options.metadata,
  });

  /**
   * The emit result is captured here, at the terminal, rather
   * than read back from the pipeline's return value: a middleware
   * that awaits next() and returns nothing (or something else)
   * has still dispatched the handlers, and their outcome must not
   * be reported as a short-circuit.
   */
  let emitResult: EventEmitResult<TEvent> | undefined;

  const terminal = async (): Promise<EventEmitResult<TEvent>> => {
    const result = await deps.emitter.emit(event, {
      mode: options.mode,

      errorMode: options.errorMode,

      signal: options.signal,

      metadata: options.metadata,
    });

    emitResult = result;

    return result;
  };

  let middlewareExecutions:
    | readonly {
        middlewareId: string;
        result: unknown;
        duration: number;
      }[]
    | undefined;

  if (allMiddleware.length > 0) {
    const pipelineResult = await executeEventMiddlewarePipeline<
      TEvent,
      unknown
    >(
      allMiddleware as readonly RegisteredEventMiddleware<TEvent, unknown>[],
      middlewareContext,
      terminal,
    );

    middlewareExecutions = pipelineResult.executions;
  } else {
    await terminal();
  }

  deps.notify({
    type: "published",

    event,

    timestamp: new Date(),
  });

  if (emitResult === undefined) {
    /**
     * A middleware short-circuited (did not call next()); no
     * handler ran.
     */
    return {
      event,
      handled: false,
      handlerCount: 0,
      succeeded: 0,
      failed: 0,
      results: [],
      errors: [],
      shortCircuited: true,
      middlewareExecutions,
    };
  }

  if (deps.onError && emitResult.errors.length > 0) {
    for (const error of emitResult.errors) {
      try {
        deps.onError(error, { source: "handler", event });
      } catch {
        /**
         * A failing error hook must not break publishing.
         */
      }
    }
  }

  return {
    event: emitResult.event,

    handled: emitResult.handled,

    handlerCount: emitResult.results.length,

    succeeded: emitResult.succeeded,

    failed: emitResult.failed,

    results: emitResult.results.map((execution) => execution.result),

    errors: emitResult.errors,

    shortCircuited: false,

    middlewareExecutions,
  };
}

/**
 * Creates and publishes an event from input data.
 */
export async function busPublishEvent<TPayload>(
  input: EventInput<TPayload>,
  options: PublishOptions,
  deps: BusPublishDependencies,
): Promise<EventPublishResult<Event<TPayload>>> {
  const event = createEvent(input);

  return busPublish(event, options, deps);
}
