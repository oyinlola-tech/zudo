/**
 * Event registry query functions for Zudojs.
 */

import type { Event, EventType } from "../eventTypes/eventDefinition.type.js";

import type { RegisteredEventHandler } from "../eventHandler/eventHandler.core.js";

import { getMatchingEventHandlers } from "../eventHandler/eventHandler.core.js";

import type {
  EventHandlerEntry,
  RegisteredEventDefinition,
} from "./eventRegistry.type.js";

import { normalizeRegistryEventType } from "./eventRegistry.registration.js";

/**
 * Returns enabled handlers matching an event, sorted by priority,
 * exactly as the emitter would dispatch them.
 *
 * The event's type is normalized before matching, mirroring
 * getHandlersForType(). Handler patterns are normalized when they
 * are registered, so an event whose `type` preserves its original
 * casing (as CQRS domain events do) still routes to the handlers
 * that registered for it. Only the routing key is normalized; the
 * event object handed to handlers is left untouched.
 */
export function getHandlersForEvent(
  handlers: Map<string, EventHandlerEntry>,
  event: Event,
): readonly RegisteredEventHandler[] {
  const type = normalizeRegistryEventType(event.type);

  const routed: Event = event.type === type ? event : { ...event, type };

  return getMatchingEventHandlers(getAllHandlers(handlers), routed);
}

/**
 * Returns enabled handlers matching an event type, sorted by
 * priority. The type is normalized before matching.
 */
export function getHandlersForType(
  handlers: Map<string, EventHandlerEntry>,
  eventType: EventType,
): readonly RegisteredEventHandler[] {
  const type = normalizeRegistryEventType(eventType);

  return getMatchingEventHandlers(getAllHandlers(handlers), {
    type,
  } as Event);
}

/**
 * Returns all event definitions as an array.
 */
export function getAllDefinitions(
  definitions: Map<EventType, RegisteredEventDefinition>,
): readonly RegisteredEventDefinition[] {
  return [...definitions.values()];
}

/**
 * Returns all handlers as an array (registration order).
 */
export function getAllHandlers(
  handlers: Map<string, EventHandlerEntry>,
): readonly RegisteredEventHandler[] {
  return [...handlers.values()].map((entry) => entry.registration);
}
