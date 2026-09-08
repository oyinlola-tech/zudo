import type { Event } from "@zudojs/events";

/**
 * Status of an event publication.
 */
export type EventResultStatus = "published" | "partial" | "failed";

/**
 * Result returned after publishing an event.
 *
 * This represents the outcome of event dispatching, not the business
 * result of the event itself.
 */
export interface EventResult<TEvent extends Event = Event> {
  readonly status: EventResultStatus;
  readonly eventType: TEvent["type"];
  readonly eventId: string;
  readonly handlerCount: number;
  readonly successfulHandlers: number;
  readonly failedHandlers: number;
  readonly publishedAt: Date;
  readonly durationMs?: number;
  readonly errors?: readonly unknown[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Options used to create an event result.
 */
export interface CreateEventResultOptions<TEvent extends Event = Event> {
  readonly event: TEvent;
  readonly handlerCount: number;
  readonly successfulHandlers?: number;
  readonly failedHandlers?: number;
  readonly publishedAt?: Date;
  readonly durationMs?: number;
  readonly errors?: readonly unknown[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Creates an event publication result.
 */
export function createEventResult<TEvent extends Event>(
  options: CreateEventResultOptions<TEvent>,
): EventResult<TEvent> {
  validateEvent(options.event);

  validateHandlerCounts(
    options.handlerCount,
    options.successfulHandlers ?? 0,
    options.failedHandlers ?? 0,
  );

  const successfulHandlers = options.successfulHandlers ?? 0;

  const failedHandlers = options.failedHandlers ?? 0;

  const status = resolveStatus(
    options.handlerCount,
    successfulHandlers,
    failedHandlers,
  );

  const result: EventResult<TEvent> = {
    status,
    eventType: options.event.type,
    eventId: options.event.id,
    handlerCount: options.handlerCount,
    successfulHandlers,
    failedHandlers,
    publishedAt: options.publishedAt ?? new Date(),
    durationMs: options.durationMs,
    errors:
      options.errors && options.errors.length > 0
        ? Object.freeze([...options.errors])
        : undefined,
    metadata: options.metadata
      ? Object.freeze({
          ...options.metadata,
        })
      : undefined,
  };

  return Object.freeze(result);
}

/**
 * Creates a result for a completely successful publication.
 */
export function createSuccessfulEventResult<TEvent extends Event>(
  event: TEvent,
  handlerCount: number,
  options: Omit<
    CreateEventResultOptions<TEvent>,
    "event" | "handlerCount" | "successfulHandlers" | "failedHandlers"
  > = {},
): EventResult<TEvent> {
  return createEventResult({
    ...options,
    event,
    handlerCount,
    successfulHandlers: handlerCount,
    failedHandlers: 0,
  });
}

/**
 * Creates a result for a partially successful publication.
 */
export function createPartialEventResult<TEvent extends Event>(
  event: TEvent,
  handlerCount: number,
  successfulHandlers: number,
  failedHandlers: number,
  options: Omit<
    CreateEventResultOptions<TEvent>,
    "event" | "handlerCount" | "successfulHandlers" | "failedHandlers"
  > = {},
): EventResult<TEvent> {
  return createEventResult({
    ...options,
    event,
    handlerCount,
    successfulHandlers,
    failedHandlers,
  });
}

/**
 * Creates a result for a completely failed publication.
 */
export function createFailedEventResult<TEvent extends Event>(
  event: TEvent,
  handlerCount: number,
  errors: readonly unknown[] = [],
  options: Omit<
    CreateEventResultOptions<TEvent>,
    | "event"
    | "handlerCount"
    | "successfulHandlers"
    | "failedHandlers"
    | "errors"
  > = {},
): EventResult<TEvent> {
  return createEventResult({
    ...options,
    event,
    handlerCount,
    successfulHandlers: 0,
    failedHandlers: handlerCount,
    errors,
  });
}

/**
 * Determines whether an event was published successfully.
 */
export function isEventPublished<TEvent extends Event>(
  result: EventResult<TEvent>,
): boolean {
  return result.status === "published";
}

/**
 * Determines whether event publication partially succeeded.
 */
export function isEventPartiallyPublished<TEvent extends Event>(
  result: EventResult<TEvent>,
): boolean {
  return result.status === "partial";
}

/**
 * Determines whether event publication failed.
 */
export function isEventFailed<TEvent extends Event>(
  result: EventResult<TEvent>,
): boolean {
  return result.status === "failed";
}

/**
 * Determines whether any event handlers failed.
 */
export function hasEventHandlerFailures<TEvent extends Event>(
  result: EventResult<TEvent>,
): boolean {
  return result.failedHandlers > 0;
}

/**
 * Determines whether every registered handler succeeded.
 */
export function allEventHandlersSucceeded<TEvent extends Event>(
  result: EventResult<TEvent>,
): boolean {
  return (
    result.failedHandlers === 0 &&
    result.successfulHandlers === result.handlerCount
  );
}

/**
 * Returns the errors captured during publication.
 */
export function getEventErrors<TEvent extends Event>(
  result: EventResult<TEvent>,
): readonly unknown[] {
  return result.errors ?? [];
}

/**
 * Adds metadata to an event result.
 */
export function withEventResultMetadata<TEvent extends Event>(
  result: EventResult<TEvent>,
  metadata: Readonly<Record<string, unknown>>,
): EventResult<TEvent> {
  return Object.freeze({
    ...result,
    metadata: Object.freeze({
      ...(result.metadata ?? {}),
      ...metadata,
    }),
  });
}

/**
 * Resolves the result status from handler execution counts.
 */
function resolveStatus(
  handlerCount: number,
  successfulHandlers: number,
  failedHandlers: number,
): EventResultStatus {
  if (failedHandlers === 0 && successfulHandlers === handlerCount) {
    return "published";
  }

  if (successfulHandlers > 0 && failedHandlers > 0) {
    return "partial";
  }

  return "failed";
}

/**
 * Validates event handler execution counts.
 */
function validateHandlerCounts(
  handlerCount: number,
  successfulHandlers: number,
  failedHandlers: number,
): void {
  if (!Number.isInteger(handlerCount) || handlerCount < 0) {
    throw new TypeError("Event handler count must be a non-negative integer.");
  }

  if (!Number.isInteger(successfulHandlers) || successfulHandlers < 0) {
    throw new TypeError(
      "Successful handler count must be a non-negative integer.",
    );
  }

  if (!Number.isInteger(failedHandlers) || failedHandlers < 0) {
    throw new TypeError("Failed handler count must be a non-negative integer.");
  }

  if (successfulHandlers + failedHandlers !== handlerCount) {
    throw new RangeError(
      "Successful and failed handler counts must equal the total handler count.",
    );
  }
}

/**
 * Validates the event attached to a result.
 */
function validateEvent(event: Event): void {
  if (!event || typeof event !== "object") {
    throw new TypeError("A valid event is required.");
  }

  if (typeof event.type !== "string" || event.type.trim().length === 0) {
    throw new TypeError("Event type is required.");
  }

  if (typeof event.id !== "string" || event.id.length === 0) {
    throw new TypeError("Event ID is required.");
  }
}
