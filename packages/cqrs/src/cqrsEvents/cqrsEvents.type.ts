import type {
  Event,
  EventId,
  EventType,
  EventCorrelationId,
} from "@zudojs/events";

import {
  createEvent as baseCreateEvent,
  createEventId as baseCreateEventId,
  isEvent as baseIsEvent,
} from "@zudojs/events";

/**
 * CQRS-specific event extensions.
 *
 * Adds aggregate identity and versioning on top of the base
 * Zudojs Event contract.
 */
export interface CqrsEventExtensions {
  readonly aggregateId?: string;
  readonly aggregateType?: string;
  readonly version?: number;
}

/**
 * CQRS event contract.
 *
 * Extends the base Zudojs Event with aggregate identity and
 * versioning fields used in event-sourced aggregates.
 */
export type CqrsEvent<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> = Event<TPayload> & CqrsEventExtensions;

/**
 * Input used to create a CQRS event.
 *
 * Identifiers are accepted as plain strings so values coming from a
 * `CqrsContext` (`requestId`, `correlationId`, `causationId`) and from
 * `createEventId()` can be passed without casts; the created event still
 * carries the branded `EventId`/`EventCorrelationId` types of the base
 * `Event` contract.
 */
export interface CreateCqrsEventInput<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly type: EventType;
  readonly payload: TPayload;
  readonly id?: string;
  readonly timestamp?: Date | number;
  readonly source?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly aggregateId?: string;
  readonly aggregateType?: string;
  readonly version?: number;
}

/**
 * Handler for a single CQRS event type.
 *
 * CQRS handlers receive only the event, unlike the base Zudojs
 * EventHandler which also receives a context object. The CQRS
 * bus handles context propagation internally.
 */
export type CqrsEventHandler<TEvent extends CqrsEvent = CqrsEvent> = (
  event: TEvent,
) => void | Promise<void>;

/**
 * CQRS event handler registration.
 */
export interface CqrsEventHandlerRegistration<
  TEvent extends CqrsEvent = CqrsEvent,
> {
  readonly eventType: TEvent["type"];
  readonly handler: CqrsEventHandler<TEvent>;
}

/**
 * Creates a unique CQRS event identifier.
 *
 * Delegates to the base Zudojs event ID generator and returns its
 * branded `EventId` (assignable to `string`).
 */
export function createEventId(): EventId {
  return baseCreateEventId();
}

/**
 * Creates an immutable CQRS event.
 *
 * Extends the base Zudojs event with aggregate fields.
 */
export function createCqrsEvent<TPayload extends Record<string, unknown>>(
  input: CreateCqrsEventInput<TPayload>,
): CqrsEvent<TPayload> {
  if (typeof input.type !== "string" || input.type.trim().length === 0) {
    throw new TypeError("Event type cannot be empty.");
  }

  if (
    !input.payload ||
    typeof input.payload !== "object" ||
    Array.isArray(input.payload)
  ) {
    throw new TypeError("Event payload must be an object.");
  }

  const base = baseCreateEvent({
    type: input.type,
    payload: input.payload,
    id: input.id as EventId | undefined,
    timestamp: input.timestamp,
    source: input.source,
    correlationId: input.correlationId as EventCorrelationId | undefined,
    causationId: input.causationId,
    metadata: input.metadata,
  });

  const event: CqrsEvent<TPayload> = {
    ...base,
    aggregateId: input.aggregateId,
    aggregateType: input.aggregateType,
    version: input.version,
  };

  return Object.freeze(event);
}

/**
 * Returns the type discriminator of an event.
 */
export function getEventType(event: CqrsEvent): string {
  return event.type;
}

/**
 * Returns the aggregate identity when available.
 */
export function getAggregateId(event: CqrsEvent): string | undefined {
  return event.aggregateId;
}

/**
 * Determines whether an unknown value has the basic CQRS event shape.
 */
export function isCqrsEvent(value: unknown): value is CqrsEvent {
  if (!baseIsEvent(value)) {
    return false;
  }

  const candidate = value as unknown as Record<string, unknown>;

  return (
    typeof candidate.type === "string" &&
    candidate.type.length > 0 &&
    typeof candidate.payload === "object" &&
    candidate.payload !== null &&
    !Array.isArray(candidate.payload) &&
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    candidate.timestamp instanceof Date
  );
}

/**
 * Determines whether an event belongs to an aggregate.
 */
export function isAggregateEvent(event: CqrsEvent): event is CqrsEvent & {
  readonly aggregateId: string;
  readonly aggregateType: string;
} {
  return (
    typeof event.aggregateId === "string" &&
    event.aggregateId.length > 0 &&
    typeof event.aggregateType === "string" &&
    event.aggregateType.length > 0
  );
}

/**
 * Creates a CQRS event handler registration.
 */
export function createCqrsEventHandler<TEvent extends CqrsEvent>(
  eventType: TEvent["type"],
  handler: CqrsEventHandler<TEvent>,
): CqrsEventHandlerRegistration<TEvent> {
  if (typeof eventType !== "string" || eventType.trim().length === 0) {
    throw new TypeError("Event type cannot be empty.");
  }

  if (typeof handler !== "function") {
    throw new TypeError("Event handler must be a function.");
  }

  return Object.freeze({
    eventType,
    handler,
  });
}

/**
 * @deprecated Use createCqrsEvent instead.
 */
export const createEvent = createCqrsEvent;

/**
 * @deprecated Use CqrsEventHandler type instead.
 */
export type EventHandler<TEvent extends CqrsEvent = CqrsEvent> =
  CqrsEventHandler<TEvent>;

/**
 * @deprecated Use CqrsEventHandlerRegistration type instead.
 */
export type EventHandlerRegistration<TEvent extends CqrsEvent = CqrsEvent> =
  CqrsEventHandlerRegistration<TEvent>;

/**
 * @deprecated Use createCqrsEventHandler instead.
 */
export const createEventHandler = createCqrsEventHandler;
