/**
 * Event bus registration and subscription methods for Zudojs.
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
} from "../eventHandler/eventHandler.core.js";

import type { EventSubscription } from "../eventSubscription/eventSubscription.core.js";

import type {
  EventMiddlewareLike,
  EventMiddlewareOptions,
  RegisteredEventMiddleware,
} from "../eventMiddleware/eventMiddleware.type.js";

import {
  createEventMiddleware,
  isEventMiddleware,
} from "../eventMiddleware/eventMiddleware.helper.js";

import type { RegisteredEventDefinition } from "../eventRegistry/eventRegistry.type.js";

import type { EventBusMiddlewareItem } from "./eventBus.type.js";

/**
 * Registers an event definition on the given registry.
 */
export function busRegister<TType extends EventType, TPayload>(
  registry: {
    register: (
      definition: EventDefinition<TType, TPayload>,
    ) => RegisteredEventDefinition<TType, TPayload>;
  },
  definition: EventDefinition<TType, TPayload>,
  ensureUsable: () => void,
): RegisteredEventDefinition<TType, TPayload> {
  ensureUsable();

  return registry.register(definition);
}

interface HandlerSource {
  on: <TEvent extends Event = Event>(
    eventType: EventTypePattern,
    handler: EventHandlerLike<TEvent>,
    options: Omit<EventHandlerOptions, "eventType">,
  ) => EventSubscription;
}

/**
 * Registers a handler on the emitter.
 */
export function busOn<TEvent extends Event = Event>(
  emitter: HandlerSource,
  eventType: EventTypePattern,
  handler: EventHandlerLike<TEvent>,
  options: Omit<EventHandlerOptions, "eventType"> = {},
  ensureUsable: () => void,
): EventSubscription {
  ensureUsable();

  return emitter.on(eventType, handler, options);
}

/**
 * Registers a one-time handler.
 */
export function busOnce<TEvent extends Event = Event>(
  emitter: HandlerSource,
  eventType: EventTypePattern,
  handler: EventHandlerLike<TEvent>,
  options: Omit<EventHandlerOptions, "eventType" | "once"> = {},
  ensureUsable: () => void,
): EventSubscription {
  return busOn(
    emitter,
    eventType,
    handler,
    {
      ...options,
      once: true,
    },
    ensureUsable,
  );
}

/**
 * Registers a wildcard handler.
 */
export function busOnAny<TEvent extends Event = Event>(
  emitter: HandlerSource,
  handler: EventHandlerLike<TEvent>,
  options: Omit<EventHandlerOptions, "eventType"> = {},
  ensureUsable: () => void,
): EventSubscription {
  return busOn(emitter, "*", handler, options, ensureUsable);
}

/**
 * Removes a handler.
 */
export function busOff(
  emitter: {
    off: (subscription: EventSubscription) => boolean;
  },
  subscription: EventSubscription,
  ensureNotDisposed: () => void,
): boolean {
  ensureNotDisposed();

  return emitter.off(subscription);
}

/**
 * Adds middleware to the bus. The middleware is validated
 * eagerly (invalid middleware or a non-finite priority throw
 * here, not on the next publish).
 */
export function busUse(
  busMiddleware: RegisteredEventMiddleware[],
  middleware: EventMiddlewareLike,
  options: EventMiddlewareOptions = {},
): () => void {
  const registered = createEventMiddleware(middleware, options);

  busMiddleware.push(registered);

  return () => {
    const idx = busMiddleware.indexOf(registered);

    if (idx >= 0) {
      busMiddleware.splice(idx, 1);
    }
  };
}

/**
 * Determines whether a value is an already registered middleware
 * (created by createEventMiddleware or a builder helper).
 */
export function isRegisteredEventMiddleware(
  value: unknown,
): value is RegisteredEventMiddleware {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { enabled?: unknown }).enabled === "boolean" &&
    isEventMiddleware((value as { middleware?: unknown }).middleware)
  );
}

/**
 * Normalizes a middleware item into a RegisteredEventMiddleware.
 *
 * `prefix` keeps generated ids stable per source ("bus-mw" for
 * constructor middleware, "publish-mw" for per-publication
 * middleware).
 */
export function registerMiddlewareItem(
  item: EventBusMiddlewareItem,
  index: number,
  prefix = "bus-mw",
): RegisteredEventMiddleware {
  if (isRegisteredEventMiddleware(item)) {
    return createEventMiddleware(item.middleware, {
      id: item.id,
      description: item.description,
      priority: item.priority,
      enabled: item.enabled,
    });
  }

  return createEventMiddleware(item as EventMiddlewareLike, {
    id: `${prefix}-${index}`,
  });
}
