/**
 * Core event primitives for Zudojs.
 *
 * Events are immutable messages that describe something that
 * happened inside the application or framework.
 *
 * This module intentionally contains no dispatching logic.
 */

import type {
  EventId as BaseEventId,
  CorrelationId as BaseCorrelationId,
} from "@zudojs/constants";

import { InvalidEventError } from "../eventErrors/eventError.base.js";

import { normalizeEventType } from "./eventType.type.js";

/**
 * Unique identifier for an event instance.
 * Re-exported from @zudojs/constants for type safety.
 */
export type EventId = BaseEventId;

/**
 * Event type identifier.
 *
 * Examples:
 *
 * "user.created"
 * "module.loaded"
 * "runtime.started"
 */
export type EventType = string;

/**
 * Event timestamp.
 */
export type EventTimestamp = Date;

/**
 * Event source identifier.
 *
 * Identifies the subsystem that produced the event.
 */
export type EventSource = string;

/**
 * Correlation identifier.
 *
 * Useful for connecting multiple events belonging to the
 * same operation/request/workflow.
 * Re-exported from @zudojs/constants for type safety.
 */
export type EventCorrelationId = BaseCorrelationId;

/**
 * Causation identifier.
 *
 * Identifies the event or operation that caused this event.
 */
export type EventCausationId = string;

/**
 * Generic event payload.
 */
export type EventPayload = unknown;

/**
 * Base event contract.
 *
 * Every Zudojs event must contain a type, unique identifier,
 * timestamp, and payload.
 */
export interface Event<TPayload = EventPayload> {
  /**
   * Unique event identifier.
   */
  readonly id: EventId;

  /**
   * Event type.
   */
  readonly type: EventType;

  /**
   * Event payload.
   */
  readonly payload: TPayload;

  /**
   * Time at which the event was created.
   */
  readonly timestamp: EventTimestamp;

  /**
   * Optional source subsystem.
   */
  readonly source?: EventSource;

  /**
   * Optional correlation identifier.
   */
  readonly correlationId?: EventCorrelationId;

  /**
   * Optional causation identifier.
   */
  readonly causationId?: EventCausationId;

  /**
   * Optional event metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Input used to create an event.
 */
export interface EventInput<TPayload = EventPayload> {
  /**
   * Optional event identifier. Plain strings are accepted and
   * branded on the created event.
   */
  readonly id?: EventId | string;

  /**
   * Event type.
   */
  readonly type: EventType;

  /**
   * Event payload.
   */
  readonly payload: TPayload;

  /**
   * Optional timestamp.
   */
  readonly timestamp?: EventTimestamp | number;

  /**
   * Optional source subsystem.
   */
  readonly source?: EventSource;

  /**
   * Optional correlation identifier. Plain strings are accepted.
   */
  readonly correlationId?: EventCorrelationId | string;

  /**
   * Optional causation identifier.
   */
  readonly causationId?: EventCausationId;

  /**
   * Optional event metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Typed event definition.
 *
 * Allows a specific event type to declare its payload.
 */
export interface EventDefinition<
  TType extends EventType = EventType,
  TPayload = EventPayload,
> {
  readonly type: TType;

  readonly create: (
    payload: TPayload,
    options?: Omit<EventInput<TPayload>, "type" | "payload">,
  ) => Event<TPayload>;
}

/**
 * Determines whether an unknown value satisfies the Event
 * contract.
 */
export function isEvent(value: unknown): value is Event {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.type === "string" &&
    candidate.timestamp instanceof Date &&
    "payload" in candidate
  );
}

/**
 * Creates a unique event identifier.
 * Returns a branded EventId type from @zudojs/constants.
 */
export function createEventId(): EventId {
  const uuid = crypto.randomUUID();

  return `event:${uuid}` as EventId;
}

/**
 * Normalizes an event timestamp.
 */
function normalizeTimestamp(timestamp: EventInput["timestamp"]): Date {
  if (timestamp === undefined) {
    return new Date();
  }

  const date =
    timestamp instanceof Date
      ? new Date(timestamp.getTime())
      : typeof timestamp === "number"
        ? new Date(timestamp)
        : undefined;

  if (date === undefined || Number.isNaN(date.getTime())) {
    throw new InvalidEventError("Invalid event timestamp.");
  }

  return date;
}

/**
 * Normalizes and validates an event type, converting validation
 * failures into InvalidEventError.
 */
function normalizeInputType(type: unknown, eventId?: string): EventType {
  if (typeof type !== "string" || type.trim().length === 0) {
    throw new InvalidEventError("Event type must be a non-empty string.", {
      eventId,
    });
  }

  try {
    return normalizeEventType(type);
  } catch (error) {
    throw new InvalidEventError(`Invalid event type "${type}".`, {
      eventType: type,
      eventId,
      cause: error,
    });
  }
}

/**
 * Freezes event metadata.
 */
function normalizeMetadata(
  metadata: EventInput["metadata"],
): Readonly<Record<string, unknown>> | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  return Object.freeze({
    ...metadata,
  });
}

/**
 * Creates an immutable event.
 *
 * The event type is normalized (trimmed, lower-cased, separators
 * collapsed) and validated; invalid types, ids and timestamps
 * throw InvalidEventError. The top-level event object is frozen;
 * the payload is left as supplied (use deepFreeze / the emitter's
 * freezeEvents option for deep immutability).
 */
export function createEvent<TPayload = EventPayload>(
  input: EventInput<TPayload>,
): Event<TPayload> {
  if (typeof input !== "object" || input === null) {
    throw new InvalidEventError("Event input must be an object.");
  }

  if (input.id !== undefined && typeof input.id !== "string") {
    throw new InvalidEventError("Event id must be a string.");
  }

  const type = normalizeInputType(input.type, input.id);

  const event: Event<TPayload> = {
    id: (input.id as EventId | undefined) ?? createEventId(),

    type,

    payload: input.payload,

    timestamp: normalizeTimestamp(input.timestamp),

    source: input.source,

    correlationId: input.correlationId as EventCorrelationId | undefined,

    causationId: input.causationId,

    metadata: normalizeMetadata(input.metadata),
  };

  return Object.freeze(event);
}

/**
 * Creates a typed event definition.
 */
export function defineEvent<TType extends EventType, TPayload>(
  type: TType,
): EventDefinition<TType, TPayload> {
  const normalized = normalizeInputType(type) as TType;

  return Object.freeze({
    type: normalized,

    create(
      payload: TPayload,
      options: Omit<EventInput<TPayload>, "type" | "payload"> = {},
    ): Event<TPayload> {
      return createEvent({
        ...options,

        type: normalized,

        payload,
      });
    },
  });
}

/**
 * Creates a copy of an event with modified metadata.
 *
 * The original event remains immutable.
 */
export function withEventMetadata<TPayload>(
  event: Event<TPayload>,
  metadata: Readonly<Record<string, unknown>>,
): Event<TPayload> {
  return createEvent({
    ...event,

    metadata: {
      ...(event.metadata ?? {}),
      ...metadata,
    },
  });
}

/**
 * Creates a derived event while preserving correlation
 * information from the original event.
 */
export function createDerivedEvent<TPayload>(
  sourceEvent: Event,
  input: EventInput<TPayload>,
): Event<TPayload> {
  return createEvent({
    ...input,

    correlationId:
      input.correlationId ??
      sourceEvent.correlationId ??
      (sourceEvent.id as unknown as BaseCorrelationId),

    causationId: input.causationId ?? sourceEvent.id,
  });
}

/**
 * Returns the event type.
 */
export function getEventType<TPayload>(event: Event<TPayload>): EventType {
  return event.type;
}

/**
 * Returns the event payload.
 */
export function getEventPayload<TPayload>(event: Event<TPayload>): TPayload {
  return event.payload;
}

/**
 * Returns a human-readable event description.
 */
export function describeEvent(event: Event): string {
  return `${event.type} (${event.id})`;
}
