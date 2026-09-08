/**
 * Event registry type definitions for Zudojs.
 */

import type {
  Event,
  EventDefinition,
  EventType,
} from "../eventTypes/eventDefinition.type.js";

import type { EventTypePattern } from "../eventTypes/eventType.type.js";

import type {
  EventHandlerLike,
  EventHandlerOptions,
  RegisteredEventHandler,
} from "../eventHandler/eventHandler.core.js";

import type { EventSubscription } from "../eventSubscription/eventSubscription.core.js";

/**
 * Policy applied when a handler is registered with an id that
 * is already in use.
 *
 * - "throw"   → DuplicateEventHandlerError (default)
 * - "replace" → the previous handler is unregistered (its
 *               subscription is cancelled) and the new one stored
 */
export type DuplicateHandlerIdPolicy = "throw" | "replace";

/**
 * Default number of handlers allowed per event pattern before a
 * leak warning is emitted.
 */
export const DEFAULT_MAX_HANDLERS_PER_PATTERN = 100;

/**
 * Warning emitted when a registry limit is exceeded.
 */
export interface EventRegistryWarning {
  readonly type: "handler.limit";
  readonly pattern: EventTypePattern;
  readonly count: number;
  readonly limit: number;
  readonly message: string;
}

/**
 * Context passed to onError hooks.
 */
export interface EventRegistryErrorContext {
  readonly source: "observer";
  readonly change?: EventRegistryChange;
}

export interface EventRegistryOptions {
  /**
   * Allow re-registering an event type. The previous definition
   * is replaced.
   */
  readonly allowDuplicateDefinitions?: boolean;

  /**
   * @deprecated Use `onDuplicateHandlerId: "replace"`. When true,
   * registering a handler id that already exists replaces the
   * previous handler (it never allowed two handlers to coexist).
   */
  readonly allowDuplicateHandlerIds?: boolean;

  /**
   * What to do when a handler id is already registered.
   * Defaults to "throw".
   */
  readonly onDuplicateHandlerId?: DuplicateHandlerIdPolicy;

  /**
   * Maximum handlers per event pattern before a leak warning is
   * emitted through `onWarning` (or console.warn). Use 0 to
   * disable. Defaults to 100.
   */
  readonly maxHandlersPerPattern?: number;

  /**
   * Receives limit warnings. Defaults to console.warn.
   */
  readonly onWarning?: (warning: EventRegistryWarning) => void;

  /**
   * Receives errors thrown by registry observers, which are
   * otherwise swallowed so they cannot break registry mutations.
   */
  readonly onError?: (
    error: unknown,
    context: EventRegistryErrorContext,
  ) => void;
}

export enum EventRegistryChangeType {
  EVENT_REGISTERED = "event.registered",
  EVENT_UNREGISTERED = "event.unregistered",
  HANDLER_REGISTERED = "handler.registered",
  HANDLER_UNREGISTERED = "handler.unregistered",
}

export interface EventRegistryChange {
  readonly type: EventRegistryChangeType;
  readonly eventType: EventType;
  readonly handler?: RegisteredEventHandler;
  readonly timestamp: Date;
}

export type EventRegistryListener = (change: EventRegistryChange) => void;

export interface RegisteredEventDefinition<
  TType extends EventType = EventType,
  TPayload = unknown,
> {
  readonly type: TType;
  readonly definition: EventDefinition<TType, TPayload>;
  readonly registeredAt: Date;
}

/**
 * Internal handler entry: the registration plus the subscription
 * handed to the caller, so the registry can cancel it.
 */
export interface EventHandlerEntry {
  readonly registration: RegisteredEventHandler;
  readonly subscription: EventSubscription;
}

/**
 * Minimal handler store contract used by EventEmitter.
 *
 * EventRegistry implements it; the emitter stores its handlers in
 * a registry so that a bus has a single source of truth for
 * handlers.
 */
export interface EventHandlerStore {
  registerHandler<TEvent extends Event = Event>(
    eventType: EventTypePattern,
    handler: EventHandlerLike<TEvent>,
    options?: Omit<EventHandlerOptions, "eventType">,
  ): EventSubscription;

  unregisterHandler(handlerId: string): boolean;

  hasHandler(handlerId: string): boolean;

  getHandlers(): readonly RegisteredEventHandler[];

  getHandlersForEvent(event: Event): readonly RegisteredEventHandler[];

  readonly handlerCount: number;
}
