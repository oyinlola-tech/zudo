/**
 * Event middleware core helpers for Zudojs.
 */

import type { Event } from "../eventTypes/eventDefinition.type.js";

import type {
  EventMiddlewareContext,
  EventMiddlewareNext,
  EventMiddleware,
  EventMiddlewareObject,
  EventMiddlewareLike,
  EventMiddlewareOptions,
  RegisteredEventMiddleware,
  EventMiddlewarePipelineOptions,
} from "./eventMiddleware.type.js";

/**
 * Generates a middleware identifier.
 */
export function createEventMiddlewareId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `middleware:${crypto.randomUUID()}`;
  }

  return `middleware:${Date.now().toString(36)}:${Math.random()
    .toString(36)
    .slice(2)}`;
}

/**
 * Determines whether a value is a function middleware.
 */
export function isFunctionEventMiddleware(
  value: unknown,
): value is EventMiddleware {
  return typeof value === "function";
}

/**
 * Determines whether a value is an object middleware.
 */
export function isObjectEventMiddleware(
  value: unknown,
): value is EventMiddlewareObject {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (
      value as {
        handle?: unknown;
      }
    ).handle === "function"
  );
}

/**
 * Determines whether a value is a supported middleware.
 */
export function isEventMiddleware(
  value: unknown,
): value is EventMiddlewareLike {
  return isFunctionEventMiddleware(value) || isObjectEventMiddleware(value);
}

/**
 * Creates a registered middleware definition.
 */
export function createEventMiddleware<
  TEvent extends Event = Event,
  TResult = unknown,
>(
  middleware: EventMiddlewareLike<TEvent, TResult>,
  options: EventMiddlewareOptions = {},
): RegisteredEventMiddleware<TEvent, TResult> {
  if (!isEventMiddleware(middleware)) {
    throw new TypeError("Invalid event middleware.");
  }

  const priority = options.priority ?? 0;

  if (!Number.isFinite(priority)) {
    throw new RangeError("Event middleware priority must be a finite number.");
  }

  return Object.freeze({
    id: options.id ?? createEventMiddlewareId(),

    description: options.description,

    priority,

    enabled: options.enabled ?? true,

    middleware,
  });
}

/**
 * Executes a middleware implementation.
 */
export async function executeEventMiddleware<TEvent extends Event, TResult>(
  middleware: EventMiddlewareLike<TEvent, TResult>,
  context: EventMiddlewareContext<TEvent>,
  next: EventMiddlewareNext<TResult>,
): Promise<TResult> {
  if (isFunctionEventMiddleware(middleware)) {
    return (middleware as EventMiddleware<TEvent, TResult>)(context, next);
  }

  return (middleware as EventMiddlewareObject<TEvent, TResult>).handle(
    context,
    next,
  );
}

/**
 * Sorts middleware by descending priority.
 */
export function sortEventMiddleware<TEvent extends Event, TResult>(
  middleware: readonly RegisteredEventMiddleware<TEvent, TResult>[],
): RegisteredEventMiddleware<TEvent, TResult>[] {
  return [...middleware].sort(
    (first, second) => second.priority - first.priority,
  );
}

/**
 * Creates a middleware context.
 */
export function createEventMiddlewareContext<TEvent extends Event>(
  event: TEvent,
  options: EventMiddlewarePipelineOptions = {},
): EventMiddlewareContext<TEvent> {
  return {
    event,

    signal: options.signal ?? new AbortController().signal,

    metadata: Object.freeze({
      ...(options.metadata ?? {}),
    }),

    executionId: createEventMiddlewareId(),

    startedAt: new Date(),

    state: options.state ?? new Map<string, unknown>(),
  };
}
