/**
 * Event middleware builder functions for Zudojs.
 */

import type { Event } from "../eventTypes/eventDefinition.type.js";

import {
  EventDispatchAbortedError,
  EventMiddlewareError,
} from "../eventErrors/eventError.base.js";

import type {
  EventMiddlewareContext,
  EventMiddlewareNext,
  EventMiddlewareOptions,
  RegisteredEventMiddleware,
} from "./eventMiddleware.type.js";

import { createEventMiddleware } from "./eventMiddleware.helper.js";

/**
 * Creates a middleware that executes before downstream
 * middleware and handlers.
 */
export function beforeEvent(
  callback: (context: EventMiddlewareContext) => void | Promise<void>,
  options: EventMiddlewareOptions = {},
): RegisteredEventMiddleware {
  return createEventMiddleware(async (context, next) => {
    await callback(context);

    return next();
  }, options);
}

/**
 * Creates a middleware that executes after downstream
 * middleware and handlers.
 */
export function afterEvent(
  callback: (
    context: EventMiddlewareContext,
    result: unknown,
  ) => void | Promise<void>,
  options: EventMiddlewareOptions = {},
): RegisteredEventMiddleware {
  return createEventMiddleware(async (context, next) => {
    const result = await next();

    await callback(context, result);

    return result;
  }, options);
}

/**
 * Creates a middleware that wraps the entire event operation.
 */
export function aroundEvent(
  callback: (
    context: EventMiddlewareContext,
    next: EventMiddlewareNext,
  ) => Promise<unknown>,
  options: EventMiddlewareOptions = {},
): RegisteredEventMiddleware {
  return createEventMiddleware(callback, options);
}

/**
 * Creates middleware that validates an event before it
 * reaches downstream handlers.
 */
export function validateEventMiddleware<TEvent extends Event>(
  validator: (event: TEvent) => boolean | Promise<boolean>,
  options: EventMiddlewareOptions = {},
): RegisteredEventMiddleware<TEvent> {
  return beforeEvent(async (context) => {
    const valid = await validator(context.event as TEvent);

    if (!valid) {
      throw new EventMiddlewareError(
        `Event "${context.event.type}" failed middleware validation.`,
        {
          eventType: context.event?.type,
          eventId: context.event?.id,
        },
      );
    }
  }, options);
}

/**
 * Creates middleware that records event timing.
 */
export function timingEventMiddleware(
  callback: (
    duration: number,
    context: EventMiddlewareContext,
  ) => void | Promise<void>,
  options: EventMiddlewareOptions = {},
): RegisteredEventMiddleware {
  return aroundEvent(async (context, next) => {
    const started = performance.now();

    try {
      return await next();
    } finally {
      await callback(performance.now() - started, context);
    }
  }, options);
}

/**
 * Creates middleware that stores a value in the
 * middleware context state.
 */
export function stateEventMiddleware<T>(
  key: string,
  factory: (context: EventMiddlewareContext) => T | Promise<T>,
  options: EventMiddlewareOptions = {},
): RegisteredEventMiddleware {
  return beforeEvent(async (context) => {
    context.state.set(key, await factory(context));
  }, options);
}

/**
 * Enables middleware.
 */
export function enableEventMiddleware<TEvent extends Event, TResult>(
  middleware: RegisteredEventMiddleware<TEvent, TResult>,
): RegisteredEventMiddleware<TEvent, TResult> {
  return Object.freeze({
    ...middleware,

    enabled: true,
  });
}

/**
 * Disables middleware.
 */
export function disableEventMiddleware<TEvent extends Event, TResult>(
  middleware: RegisteredEventMiddleware<TEvent, TResult>,
): RegisteredEventMiddleware<TEvent, TResult> {
  return Object.freeze({
    ...middleware,

    enabled: false,
  });
}

/**
 * Creates a middleware that stops execution when the
 * supplied AbortSignal is cancelled.
 */
export function abortableEventMiddleware(
  options: EventMiddlewareOptions = {},
): RegisteredEventMiddleware {
  return beforeEvent(async (context) => {
    if (context.signal.aborted) {
      throw new EventDispatchAbortedError("Event dispatch was aborted.", {
        eventType: context.event?.type,
        eventId: context.event?.id,
      });
    }
  }, options);
}
