/**
 * Event registry lifecycle methods for Zudojs.
 */

import type { EventType } from "../eventTypes/eventDefinition.type.js";

import type {
  EventHandlerEntry,
  EventRegistryChange,
  EventRegistryErrorContext,
  EventRegistryListener,
  RegisteredEventDefinition,
} from "./eventRegistry.type.js";

import { registryUnregister } from "./eventRegistry.registration.js";

/**
 * Clears all handlers and definitions from the registry.
 *
 * Every handler subscription is cancelled, so subscriptions held
 * by callers report `active: false` afterwards.
 */
export function registryClear(
  definitions: Map<EventType, RegisteredEventDefinition>,
  handlers: Map<string, EventHandlerEntry>,
  ensureActive: () => void,
  notify: (change: EventRegistryChange) => void,
): void {
  ensureActive();

  const entries = [...handlers.values()];

  for (const entry of entries) {
    entry.subscription.unsubscribe();
  }

  handlers.clear();

  const eventTypes = [...definitions.keys()];

  for (const eventType of eventTypes) {
    registryUnregister(eventType, definitions, ensureActive, notify);
  }
}

/**
 * Disposes the registry.
 */
export function registryDispose(
  disposed: boolean,
  definitions: Map<EventType, RegisteredEventDefinition>,
  handlers: Map<string, EventHandlerEntry>,
  listeners: Set<EventRegistryListener>,
  ensureActive: () => void,
  notify: (change: EventRegistryChange) => void,
): void {
  if (disposed) {
    return;
  }

  registryClear(definitions, handlers, ensureActive, notify);

  listeners.clear();
}

/**
 * Notifies registry listeners.
 *
 * Observer failures never break registry mutations; they are
 * forwarded to the `onError` hook when one is configured.
 */
export function registryNotify(
  change: EventRegistryChange,
  listeners: Set<EventRegistryListener>,
  onError?: (error: unknown, context: EventRegistryErrorContext) => void,
): void {
  for (const listener of listeners) {
    try {
      listener(change);
    } catch (error) {
      if (onError) {
        try {
          onError(error, { source: "observer", change });
        } catch {
          /**
           * A failing error hook must not break the mutation either.
           */
        }
      }
    }
  }
}
