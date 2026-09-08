/**
 * Event registry registration methods for Zudojs.
 */

import type {
  Event,
  EventDefinition,
  EventType,
} from "../eventTypes/eventDefinition.type.js";

import type { EventTypePattern } from "../eventTypes/eventType.type.js";

import { normalizeEventType } from "../eventTypes/eventType.type.js";

import type {
  EventHandlerLike,
  EventHandlerOptions,
  RegisteredEventHandler,
} from "../eventHandler/eventHandler.core.js";

import { createEventHandler } from "../eventHandler/eventHandler.core.js";

import type { EventSubscription } from "../eventSubscription/eventSubscription.core.js";

import { createEventSubscription } from "../eventSubscription/eventSubscription.core.js";

import {
  DuplicateEventDefinitionError,
  DuplicateEventHandlerError,
  InvalidEventError,
} from "../eventErrors/eventError.base.js";

import type {
  DuplicateHandlerIdPolicy,
  EventHandlerEntry,
  EventRegistryChange,
  EventRegistryWarning,
  RegisteredEventDefinition,
} from "./eventRegistry.type.js";

import { EventRegistryChangeType } from "./eventRegistry.type.js";

/**
 * Normalizes an event type for registry lookups, converting
 * validation failures into InvalidEventError.
 */
export function normalizeRegistryEventType(eventType: string): EventType {
  try {
    return normalizeEventType(eventType);
  } catch (error) {
    throw new InvalidEventError(`Invalid event type "${String(eventType)}".`, {
      eventType: typeof eventType === "string" ? eventType : undefined,
      cause: error,
    });
  }
}

/**
 * Registers an event definition.
 */
export function registryRegister<TType extends EventType, TPayload>(
  definition: EventDefinition<TType, TPayload>,
  definitions: Map<EventType, RegisteredEventDefinition>,
  options: {
    allowDuplicateDefinitions: boolean;
  },
  ensureActive: () => void,
  notify: (change: EventRegistryChange) => void,
): RegisteredEventDefinition<TType, TPayload> {
  ensureActive();

  if (
    typeof definition !== "object" ||
    definition === null ||
    typeof definition.type !== "string" ||
    typeof definition.create !== "function"
  ) {
    throw new InvalidEventError(
      "Event definition must be created with defineEvent().",
    );
  }

  const type = normalizeRegistryEventType(definition.type);

  if (definitions.has(type) && !options.allowDuplicateDefinitions) {
    throw new DuplicateEventDefinitionError(type);
  }

  /**
   * The stored definition always stamps the normalized type so
   * events it creates are publishable under the registered type.
   */
  const normalizedDefinition: EventDefinition<TType, TPayload> =
    definition.type === type
      ? definition
      : Object.freeze({
          type: type as TType,
          create: (
            payload: TPayload,
            createOptions?: Parameters<typeof definition.create>[1],
          ) => ({
            ...definition.create(payload, createOptions),
            type,
          }),
        });

  const registered: RegisteredEventDefinition<TType, TPayload> = Object.freeze({
    type: type as TType,

    definition: normalizedDefinition,

    registeredAt: new Date(),
  });

  definitions.set(type, registered as RegisteredEventDefinition);

  notify({
    type: EventRegistryChangeType.EVENT_REGISTERED,

    eventType: type,

    timestamp: new Date(),
  });

  return registered;
}

/**
 * Registers a handler.
 */
export function registryRegisterHandler<TEvent extends Event = Event>(
  eventType: EventTypePattern,
  handler: EventHandlerLike<TEvent>,
  handlerOptions: Omit<EventHandlerOptions, "eventType">,
  handlers: Map<string, EventHandlerEntry>,
  options: {
    onDuplicateHandlerId: DuplicateHandlerIdPolicy;
    maxHandlersPerPattern: number;
    onWarning: (warning: EventRegistryWarning) => void;
  },
  ensureActive: () => void,
  notify: (change: EventRegistryChange) => void,
  warnedPatterns: Set<string>,
): EventSubscription {
  ensureActive();

  /**
   * createEventHandler validates the handler, the pattern and the
   * options, and normalizes the pattern.
   */
  const registration = createEventHandler(handler, {
    ...handlerOptions,

    eventType,
  }) as RegisteredEventHandler;

  const existing = handlers.get(registration.id);

  if (existing) {
    if (options.onDuplicateHandlerId === "throw") {
      throw new DuplicateEventHandlerError(registration.id);
    }

    existing.subscription.unsubscribe();
  }

  const subscription = createEventSubscription(
    () => {
      /**
       * Identity check: only remove the entry if it still belongs
       * to this registration. A replacement registered under the
       * same id must not be removed by the old subscription. No
       * ensureActive here so teardown after dispose is a no-op.
       */
      if (handlers.get(registration.id)?.registration !== registration) {
        return;
      }

      handlers.delete(registration.id);

      notify({
        type: EventRegistryChangeType.HANDLER_UNREGISTERED,

        eventType: registration.eventType,

        handler: registration,

        timestamp: new Date(),
      });
    },
    {
      id: registration.id,

      description: registration.description,
    },
  );

  handlers.set(registration.id, { registration, subscription });

  checkHandlerLimit(
    registration.eventType,
    handlers,
    options.maxHandlersPerPattern,
    options.onWarning,
    warnedPatterns,
  );

  notify({
    type: EventRegistryChangeType.HANDLER_REGISTERED,

    eventType: registration.eventType,

    handler: registration,

    timestamp: new Date(),
  });

  return subscription;
}

/**
 * Emits a leak warning (once per pattern) when the number of
 * handlers for a pattern exceeds the configured limit.
 */
function checkHandlerLimit(
  pattern: EventTypePattern,
  handlers: Map<string, EventHandlerEntry>,
  limit: number,
  onWarning: (warning: EventRegistryWarning) => void,
  warnedPatterns: Set<string>,
): void {
  if (limit <= 0 || warnedPatterns.has(pattern)) {
    return;
  }

  let count = 0;

  for (const entry of handlers.values()) {
    if (entry.registration.eventType === pattern) {
      count++;
    }
  }

  if (count <= limit) {
    return;
  }

  warnedPatterns.add(pattern);

  const warning: EventRegistryWarning = {
    type: "handler.limit",
    pattern,
    count,
    limit,
    message:
      `Possible event handler leak: ${count} handlers registered for ` +
      `"${pattern}" (limit ${limit}). Unsubscribe handlers you no longer ` +
      "need or raise maxHandlersPerPattern / maxListeners.",
  };

  try {
    onWarning(warning);
  } catch {
    /**
     * A failing warning hook must not break registration.
     */
  }
}

/**
 * Unregisters an event definition.
 */
export function registryUnregister(
  eventType: EventType,
  definitions: Map<EventType, RegisteredEventDefinition>,
  ensureActive: () => void,
  notify: (change: EventRegistryChange) => void,
): boolean {
  ensureActive();

  const type = normalizeRegistryEventType(eventType);

  const removed = definitions.delete(type);

  if (removed) {
    notify({
      type: EventRegistryChangeType.EVENT_UNREGISTERED,

      eventType: type,

      timestamp: new Date(),
    });
  }

  return removed;
}

/**
 * Unregisters a handler by id, cancelling its subscription.
 */
export function registryUnregisterHandler(
  handlerId: string,
  handlers: Map<string, EventHandlerEntry>,
  ensureActive: () => void,
): boolean {
  ensureActive();

  const entry = handlers.get(handlerId);

  if (!entry) {
    return false;
  }

  /**
   * The subscription callback removes the entry and notifies.
   */
  entry.subscription.unsubscribe();

  return !handlers.has(handlerId);
}
