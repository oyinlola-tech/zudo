/**
 * Event bus type definitions for Zudojs.
 */

import type { Event } from "../eventTypes/eventDefinition.type.js";

import type {
  EventEmitterMode,
  EventErrorMode,
} from "../eventEmitter/eventEmitter.type.js";

import type {
  EventMiddlewareLike,
  RegisteredEventMiddleware,
} from "../eventMiddleware/eventMiddleware.type.js";

import type {
  DuplicateHandlerIdPolicy,
  EventRegistryWarning,
} from "../eventRegistry/eventRegistry.type.js";

/**
 * Middleware accepted by bus options: a plain middleware function
 * or object, or a registered middleware created with
 * createEventMiddleware() / the builder helpers.
 */
export type EventBusMiddlewareItem =
  | EventMiddlewareLike
  | RegisteredEventMiddleware;

/**
 * Context passed to the bus `onError` hook.
 */
export interface EventBusErrorContext {
  /**
   * "handler"  → a handler failed during a CONTINUE-mode publish
   * "observer" → a bus lifecycle observer threw
   */
  readonly source: "handler" | "observer";
  readonly event?: Event;
}

export interface EventBusOptions {
  readonly emitter?: {
    readonly mode?: EventEmitterMode;
    readonly errorMode?: EventErrorMode;
    /**
     * Deep-freeze events (payload included) before dispatch.
     * Defaults to true.
     */
    readonly freezeEvents?: boolean;
    /**
     * Maximum handlers per event pattern before a leak warning is
     * emitted (0 disables). Defaults to 100.
     */
    readonly maxListeners?: number;
  };
  readonly registry?: {
    readonly allowDuplicateDefinitions?: boolean;
    /**
     * @deprecated Use `onDuplicateHandlerId: "replace"`.
     */
    readonly allowDuplicateHandlerIds?: boolean;
    readonly onDuplicateHandlerId?: DuplicateHandlerIdPolicy;
  };
  /**
   * Reject publishes for event types that were not registered
   * with register(). Defaults to false.
   */
  readonly requireRegistration?: boolean;
  readonly middleware?: readonly EventBusMiddlewareItem[];
  /**
   * Receives leak warnings. Defaults to console.warn.
   */
  readonly onWarning?: (warning: EventRegistryWarning) => void;
  /**
   * Receives handler errors from CONTINUE-mode publishes and
   * errors thrown by bus/registry observers. Useful for
   * fire-and-forget publishes whose result is never inspected.
   */
  readonly onError?: (error: unknown, context: EventBusErrorContext) => void;
}

export interface PublishOptions {
  readonly mode?: EventEmitterMode;
  readonly errorMode?: EventErrorMode;
  readonly signal?: AbortSignal;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly middleware?: readonly EventBusMiddlewareItem[];
}

export interface EventPublishResult<TEvent extends Event = Event> {
  readonly event: TEvent;
  /**
   * True when at least one handler completed successfully.
   */
  readonly handled: boolean;
  /**
   * Number of handlers invoked.
   */
  readonly handlerCount: number;
  /**
   * Number of handlers that completed successfully.
   */
  readonly succeeded: number;
  /**
   * Number of handlers that threw.
   */
  readonly failed: number;
  readonly results: readonly unknown[];
  readonly errors: readonly unknown[];
  /**
   * True when a middleware did not call next(), so no handler ran.
   */
  readonly shortCircuited: boolean;
  readonly middlewareExecutions?: readonly {
    readonly middlewareId: string;
    readonly result: unknown;
    readonly duration: number;
  }[];
}

export enum EventBusState {
  /**
   * Created, never started. The first publish/subscribe starts
   * the bus automatically.
   */
  CREATED = "created",
  ACTIVE = "active",
  /**
   * Stopped with stop(). Publishing and subscribing throw
   * EventBusStoppedError until start() is called again.
   */
  STOPPED = "stopped",
  DISPOSED = "disposed",
}

export interface EventBusEvent {
  readonly type: "started" | "stopped" | "published";
  readonly event?: Event;
  readonly timestamp: Date;
}

export type EventBusListener = (event: EventBusEvent) => void;
