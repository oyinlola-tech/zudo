/**
 * Event emitter core class for Zudojs.
 *
 * The emitter dispatches events to handlers. Handlers are stored
 * in an EventHandlerStore (an EventRegistry by default) so that a
 * bus and its registry share one set of handlers.
 */

import type { Event, EventInput } from "../eventTypes/eventDefinition.type.js";

import type { EventTypePattern } from "../eventTypes/eventType.type.js";

import { createEvent, isEvent } from "../eventTypes/eventDefinition.type.js";

import { deepFreeze } from "../eventTypes/eventPayload.type.js";

import type {
  EventHandlerLike,
  EventHandlerOptions,
  RegisteredEventHandler,
} from "../eventHandler/eventHandler.core.js";

import { createEventHandlerContext } from "../eventHandler/eventHandler.core.js";

import type { EventSubscription } from "../eventSubscription/eventSubscription.core.js";

import { EventSubscriptionGroup } from "../eventSubscription/eventSubscription.core.js";

import type { EventHandlerStore } from "../eventRegistry/eventRegistry.type.js";

import { EventRegistry } from "../eventRegistry/eventRegistry.store.js";

import {
  EventEmitterDisposedError,
  InvalidEventError,
} from "../eventErrors/eventError.base.js";

import type {
  EventEmitterOptions,
  EmitOptions,
  EventHandlerExecutionResult,
  EventEmitResult,
} from "./eventEmitter.type.js";

import { EventEmitterMode, EventErrorMode } from "./eventEmitter.type.js";

import { emitSequential } from "./eventEmitter.sequential.js";

import { emitParallel } from "./eventEmitter.parallel.js";

import { createAbortError } from "./eventEmitter.abort.js";

/**
 * Main local event emitter.
 */
export class EventEmitter {
  private readonly store: EventHandlerStore;

  private readonly options: Required<
    Pick<EventEmitterOptions, "mode" | "errorMode" | "freezeEvents">
  >;

  private disposed = false;

  constructor(options: EventEmitterOptions = {}) {
    this.options = {
      mode: options.mode ?? EventEmitterMode.SEQUENTIAL,

      errorMode: options.errorMode ?? EventErrorMode.THROW,

      freezeEvents: options.freezeEvents ?? true,
    };

    this.store =
      options.store ??
      new EventRegistry({
        maxHandlersPerPattern: options.maxListeners,
        onWarning: options.onWarning,
      });
  }

  on<TEvent extends Event = Event>(
    eventType: EventTypePattern,
    handler: EventHandlerLike<TEvent>,
    options: Omit<EventHandlerOptions, "eventType"> = {},
  ): EventSubscription {
    this.ensureActive();

    return this.store.registerHandler(eventType, handler, options);
  }

  once<TEvent extends Event = Event>(
    eventType: EventTypePattern,
    handler: EventHandlerLike<TEvent>,
    options: Omit<EventHandlerOptions, "eventType" | "once"> = {},
  ): EventSubscription {
    return this.on(eventType, handler, {
      ...options,
      once: true,
    });
  }

  onAny<TEvent extends Event = Event>(
    handler: EventHandlerLike<TEvent>,
    options: Omit<EventHandlerOptions, "eventType"> = {},
  ): EventSubscription {
    return this.on("*", handler, options);
  }

  /**
   * Cancels a subscription. Returns true when the subscription
   * was active (and is now cancelled).
   */
  off(subscription: EventSubscription): boolean {
    this.ensureActive();

    const wasActive = subscription.active;

    subscription.unsubscribe();

    return wasActive;
  }

  async emit<TEvent extends Event>(
    event: TEvent,
    options: EmitOptions = {},
  ): Promise<EventEmitResult<TEvent>> {
    this.ensureActive();

    if (!isEvent(event)) {
      throw new InvalidEventError(
        "emit() requires an Event (use emitEvent() for event input).",
      );
    }

    if (options.signal?.aborted) {
      throw createAbortError(event);
    }

    const mode = options.mode ?? this.options.mode;

    const errorMode = options.errorMode ?? this.options.errorMode;

    const dispatched = this.options.freezeEvents ? deepFreeze(event) : event;

    const handlers = this.store.getHandlersForEvent(
      dispatched,
    ) as readonly RegisteredEventHandler<TEvent>[];

    const context = createEventHandlerContext(dispatched, {
      signal: options.signal,
      metadata: options.metadata,
    });

    const results: EventHandlerExecutionResult[] = [];

    const errors: unknown[] = [];

    if (handlers.length === 0) {
      return {
        event: dispatched,
        handled: false,
        results,
        errors,
        succeeded: 0,
        failed: 0,
      };
    }

    const hooks = {
      isRegistered: (handlerId: string) => this.store.hasHandler(handlerId),

      removeOnce: (handlerId: string) => {
        this.store.unregisterHandler(handlerId);
      },
    };

    if (mode === EventEmitterMode.PARALLEL) {
      await emitParallel(
        handlers,
        dispatched,
        context,
        errorMode,
        results,
        errors,
        hooks,
      );
    } else {
      await emitSequential(
        handlers,
        dispatched,
        context,
        errorMode,
        results,
        errors,
        hooks,
      );
    }

    const succeeded = results.filter((result) => result.ok).length;

    return {
      event: dispatched,
      handled: succeeded > 0,
      results,
      errors,
      succeeded,
      failed: results.length - succeeded,
    };
  }

  async emitEvent<TPayload>(
    input: EventInput<TPayload>,
    options: EmitOptions = {},
  ): Promise<EventEmitResult<Event<TPayload>>> {
    const event = createEvent(input);

    return this.emit(event, options);
  }

  get listenerCount(): number {
    return this.store.handlerCount;
  }

  /**
   * Returns the handler store backing this emitter.
   */
  getStore(): EventHandlerStore {
    return this.store;
  }

  getRegistrations(): readonly RegisteredEventHandler[] {
    return this.store.getHandlers();
  }

  removeAllListeners(): void {
    this.ensureActive();

    for (const registration of this.store.getHandlers()) {
      this.store.unregisterHandler(registration.id);
    }
  }

  createSubscriptionGroup(): EventSubscriptionGroup {
    this.ensureActive();

    return new EventSubscriptionGroup();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.removeAllListeners();

    this.disposed = true;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  private ensureActive(): void {
    if (this.disposed) {
      throw new EventEmitterDisposedError();
    }
  }
}

/**
 * Creates a new event emitter.
 */
export function createEventEmitter(
  options: EventEmitterOptions = {},
): EventEmitter {
  return new EventEmitter(options);
}
