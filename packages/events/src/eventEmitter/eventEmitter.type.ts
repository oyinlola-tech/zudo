/**
 * Event emitter type definitions for Zudojs.
 */

import type { Event } from "../eventTypes/eventDefinition.type.js";

import type { RegisteredEventHandler } from "../eventHandler/eventHandler.core.js";

import type { EventSubscription } from "../eventSubscription/eventSubscription.core.js";

import type {
  EventHandlerStore,
  EventRegistryWarning,
} from "../eventRegistry/eventRegistry.type.js";

export enum EventEmitterMode {
  SEQUENTIAL = "sequential",
  PARALLEL = "parallel",
}

export enum EventErrorMode {
  THROW = "throw",
  CONTINUE = "continue",
}

export interface EventEmitterOptions {
  /**
   * Dispatch mode. Defaults to SEQUENTIAL.
   */
  readonly mode?: EventEmitterMode;

  /**
   * Error mode. Defaults to THROW.
   */
  readonly errorMode?: EventErrorMode;

  /**
   * Deep-freeze events (including their payload) before they are
   * handed to handlers so no handler can alter what other handlers
   * see. Defaults to true. Note that freezing mutates the payload
   * object passed in; clone it first if you need to keep it
   * mutable elsewhere.
   */
  readonly freezeEvents?: boolean;

  /**
   * Handler store to use. When omitted the emitter creates a
   * private EventRegistry. EventBus passes its registry so that
   * handlers registered on either side are dispatched.
   */
  readonly store?: EventHandlerStore;

  /**
   * Maximum handlers per event pattern before a leak warning is
   * emitted (0 disables). Only applies to the private store.
   * Defaults to 100.
   */
  readonly maxListeners?: number;

  /**
   * Receives leak warnings. Only applies to the private store.
   * Defaults to console.warn.
   */
  readonly onWarning?: (warning: EventRegistryWarning) => void;
}

export interface EmitOptions {
  readonly mode?: EventEmitterMode;
  readonly errorMode?: EventErrorMode;
  readonly signal?: AbortSignal;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface EventHandlerExecutionResult {
  readonly handlerId: string;
  readonly eventId: string;
  /**
   * True when the handler settled without throwing.
   */
  readonly ok: boolean;
  readonly result: unknown;
  readonly duration: number;
  /**
   * The raw value thrown by the handler when `ok` is false.
   */
  readonly error?: unknown;
}

export interface EventEmitResult<TEvent extends Event = Event> {
  readonly event: TEvent;
  /**
   * True when at least one handler completed successfully.
   */
  readonly handled: boolean;
  /**
   * One entry per invoked handler, in invocation order.
   */
  readonly results: readonly EventHandlerExecutionResult[];
  /**
   * Handler failures wrapped as EventHandlerError (cause holds the
   * raw thrown value).
   */
  readonly errors: readonly unknown[];
  /**
   * Number of handlers that completed successfully.
   */
  readonly succeeded: number;
  /**
   * Number of handlers that threw.
   */
  readonly failed: number;
}

/**
 * @deprecated Handlers are stored in an EventRegistry; this shape
 * is kept for type compatibility only.
 */
export interface EmitterListener {
  readonly registration: RegisteredEventHandler;
  readonly subscription: EventSubscription;
}
