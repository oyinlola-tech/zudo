/**
 * Event bus core class for Zudojs.
 */

import type {
  Event,
  EventDefinition,
  EventInput,
  EventType,
} from "../eventTypes/eventDefinition.type.js";

import { isEvent } from "../eventTypes/eventDefinition.type.js";

import type { EventTypePattern } from "../eventTypes/eventType.type.js";

import type {
  EventHandlerLike,
  EventHandlerOptions,
  RegisteredEventHandler,
} from "../eventHandler/eventHandler.core.js";

import type { EventSubscription } from "../eventSubscription/eventSubscription.core.js";

import { EventEmitter } from "../eventEmitter/eventEmitter.core.js";

import { EventErrorMode } from "../eventEmitter/eventEmitter.type.js";

import { EventRegistry } from "../eventRegistry/eventRegistry.store.js";

import {
  EventBusDisposedError,
  EventBusStoppedError,
  EventError,
  toEventError,
} from "../eventErrors/eventError.base.js";

import type {
  EventMiddlewareLike,
  EventMiddlewareOptions,
  RegisteredEventMiddleware,
} from "../eventMiddleware/eventMiddleware.type.js";

import type {
  EventBusOptions,
  PublishOptions,
  EventPublishResult,
  EventBusEvent,
  EventBusListener,
} from "./eventBus.type.js";

import { EventBusState } from "./eventBus.type.js";

export { EventBusState } from "./eventBus.type.js";

import {
  busOn,
  busOnce,
  busOnAny,
  busOff,
  busUse,
  registerMiddlewareItem,
} from "./eventBus.registration.js";

import type { BusPublishDependencies } from "./eventBus.publish.js";

import { busPublish, busPublishEvent } from "./eventBus.publish.js";

/**
 * High-level event bus.
 *
 * Lifecycle: CREATED → ACTIVE ⇄ STOPPED → DISPOSED. A CREATED bus
 * starts itself on first use; a STOPPED bus rejects publishing and
 * subscribing until start() is called; a DISPOSED bus rejects
 * everything.
 */
export class EventBus {
  private readonly emitter: EventEmitter;

  private readonly registry: EventRegistry;

  private readonly options: Required<
    Pick<EventBusOptions, "requireRegistration">
  > &
    Pick<EventBusOptions, "onError">;

  private busMiddleware: RegisteredEventMiddleware[];

  private readonly listeners = new Set<EventBusListener>();

  private state: EventBusState = EventBusState.CREATED;

  constructor(options: EventBusOptions = {}) {
    this.options = {
      requireRegistration: options.requireRegistration ?? false,

      onError: options.onError,
    };

    this.registry = new EventRegistry({
      ...options.registry,

      maxHandlersPerPattern: options.emitter?.maxListeners,

      onWarning: options.onWarning,

      onError: options.onError
        ? (error, context) =>
            options.onError?.(error, {
              source: context.source,
            })
        : undefined,
    });

    /**
     * The emitter stores its handlers in the bus registry so
     * handlers registered through either surface are dispatched.
     */
    this.emitter = new EventEmitter({
      mode: options.emitter?.mode,

      errorMode: options.emitter?.errorMode ?? EventErrorMode.CONTINUE,

      freezeEvents: options.emitter?.freezeEvents,

      store: this.registry,
    });

    this.busMiddleware = (options.middleware ?? []).map((m, index) =>
      registerMiddlewareItem(m, index),
    );
  }

  start(): this {
    this.ensureNotDisposed();

    if (this.state === EventBusState.ACTIVE) {
      return this;
    }

    this.state = EventBusState.ACTIVE;

    this.notify({
      type: "started",

      timestamp: new Date(),
    });

    return this;
  }

  /**
   * Stops the bus. Publishing and subscribing throw
   * EventBusStoppedError until start() is called again; handlers
   * and definitions are kept.
   */
  stop(): this {
    this.ensureNotDisposed();

    if (this.state !== EventBusState.ACTIVE) {
      return this;
    }

    this.state = EventBusState.STOPPED;

    this.notify({
      type: "stopped",

      timestamp: new Date(),
    });

    return this;
  }

  register<TType extends EventType, TPayload>(
    definition: EventDefinition<TType, TPayload>,
  ) {
    this.ensureUsable("register");

    return this.registry.register(definition);
  }

  on<TEvent extends Event = Event>(
    eventType: EventTypePattern,
    handler: EventHandlerLike<TEvent>,
    options: Omit<EventHandlerOptions, "eventType"> = {},
  ): EventSubscription {
    return busOn(this.emitter, eventType, handler, options, () =>
      this.ensureUsable("subscribe"),
    );
  }

  once<TEvent extends Event = Event>(
    eventType: EventTypePattern,
    handler: EventHandlerLike<TEvent>,
    options: Omit<EventHandlerOptions, "eventType" | "once"> = {},
  ): EventSubscription {
    return busOnce(this.emitter, eventType, handler, options, () =>
      this.ensureUsable("subscribe"),
    );
  }

  onAny<TEvent extends Event = Event>(
    handler: EventHandlerLike<TEvent>,
    options: Omit<EventHandlerOptions, "eventType"> = {},
  ): EventSubscription {
    return busOnAny(this.emitter, handler, options, () =>
      this.ensureUsable("subscribe"),
    );
  }

  off(subscription: EventSubscription): boolean {
    return busOff(this.emitter, subscription, () => this.ensureNotDisposed());
  }

  use(
    middleware: EventMiddlewareLike,
    options: EventMiddlewareOptions = {},
  ): () => void {
    this.ensureNotDisposed();

    return busUse(this.busMiddleware, middleware, options);
  }

  async publish<TEvent extends Event>(
    event: TEvent,
    options: PublishOptions = {},
  ): Promise<EventPublishResult<TEvent>> {
    return busPublish(event, options, this.publishDependencies());
  }

  async publishEvent<TPayload>(
    input: EventInput<TPayload>,
    options: PublishOptions = {},
  ): Promise<EventPublishResult<Event<TPayload>>> {
    return busPublishEvent(input, options, this.publishDependencies());
  }

  /**
   * Publishes an event or event input. A full Event is published
   * as is; an EventInput ({ type, payload, ... }) is turned into
   * an event first.
   */
  async emit<TPayload>(
    input: Event<TPayload> | EventInput<TPayload>,
    options: PublishOptions = {},
  ): Promise<EventPublishResult<Event<TPayload>>> {
    if (isEvent(input)) {
      return this.publish(input as Event<TPayload>, options);
    }

    return this.publishEvent(input, options);
  }

  getDefinition<TType extends EventType, TPayload = unknown>(eventType: TType) {
    this.ensureNotDisposed();

    return this.registry.get<TType, TPayload>(eventType);
  }

  hasEvent(eventType: EventType): boolean {
    this.ensureNotDisposed();

    return this.registry.has(eventType);
  }

  /**
   * Removes an event definition. Handlers are not affected unless
   * `removeHandlers` is true, in which case every handler whose
   * pattern is exactly this event type is unregistered too.
   */
  unregister(
    eventType: EventType,
    options: { readonly removeHandlers?: boolean } = {},
  ): boolean {
    this.ensureNotDisposed();

    const removed = this.registry.unregister(eventType);

    if (options.removeHandlers) {
      const definition = this.registry.getHandlersForType(eventType);

      for (const handler of definition) {
        if (handler.eventType !== "*" && !handler.eventType.endsWith(".*")) {
          this.registry.unregisterHandler(handler.id);
        }
      }
    }

    return removed;
  }

  getRegistry(): EventRegistry {
    this.ensureNotDisposed();

    return this.registry;
  }

  getEmitter(): EventEmitter {
    this.ensureNotDisposed();

    return this.emitter;
  }

  getDefinitions() {
    this.ensureNotDisposed();

    return this.registry.getDefinitions();
  }

  getHandlers(): readonly RegisteredEventHandler[] {
    this.ensureNotDisposed();

    return this.registry.getHandlers();
  }

  getState(): EventBusState {
    return this.state;
  }

  isActive(): boolean {
    return this.state === EventBusState.ACTIVE;
  }

  get eventCount(): number {
    return this.registry.eventCount;
  }

  get handlerCount(): number {
    return this.registry.handlerCount;
  }

  subscribe(listener: EventBusListener): () => void {
    this.ensureNotDisposed();

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    if (this.state === EventBusState.DISPOSED) {
      return;
    }

    this.emitter.dispose();
    this.registry.dispose();

    this.listeners.clear();

    this.state = EventBusState.DISPOSED;
  }

  toError(error: unknown, event?: Event): EventError {
    return toEventError(error, {
      eventType: event?.type,
      eventId: event?.id,
    });
  }

  private publishDependencies(): BusPublishDependencies {
    return {
      emitter: this.emitter,
      registry: this.registry,
      busMiddleware: this.busMiddleware,
      requireRegistration: this.options.requireRegistration,
      ensureUsable: () => this.ensureUsable("publish"),
      notify: (e) => this.notify(e),
      onError: this.options.onError,
    };
  }

  /**
   * Auto-starts a CREATED bus; rejects a STOPPED or DISPOSED one.
   */
  private ensureUsable(operation: string): void {
    this.ensureNotDisposed();

    if (this.state === EventBusState.STOPPED) {
      throw new EventBusStoppedError(operation);
    }

    if (this.state === EventBusState.CREATED) {
      this.start();
    }
  }

  private ensureNotDisposed(): void {
    if (this.state === EventBusState.DISPOSED) {
      throw new EventBusDisposedError();
    }
  }

  private notify(event: EventBusEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        /**
         * Observers must never be able to break event bus
         * operations; failures go to the onError hook.
         */
        try {
          this.options.onError?.(error, {
            source: "observer",
            event: event.event,
          });
        } catch {
          // Ignore failures of the error hook itself.
        }
      }
    }
  }
}
