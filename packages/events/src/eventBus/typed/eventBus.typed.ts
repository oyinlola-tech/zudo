/**
 * A payload-map-typed view over an `EventBus`.
 *
 * `bus.on<Event<P>>(type, handler)` lets the caller assert any payload
 * type for any event type — `bus.on<Event<OrderPlaced>>("stock.low", h)`
 * compiles and the handler reads fields that are not there. The typed view
 * ties both ends to one payload map, so the event type selects the payload
 * type on subscribe and on publish alike.
 *
 * @module eventBus/typed
 */

import type { Event } from "../../eventTypes/eventDefinition.type.js";
import type {
  EventPayloadMap,
  PayloadOf,
} from "../../eventTypes/eventPayload.type.js";
import type {
  EventTypeOf,
  EventUnion,
} from "../../eventTypes/eventType.type.js";
import type {
  EventHandlerLike,
  EventHandlerOptions,
} from "../../eventHandler/eventHandler.core.js";
import type { EventSubscription } from "../../eventSubscription/eventSubscription.core.js";

import type { EventBus } from "../eventBus.core.js";
import type { EventPublishResult, PublishOptions } from "../eventBus.type.js";

/** The event a handler receives for type `TType` of map `TMap`. */
export type TypedEvent<
  TMap extends EventPayloadMap,
  TType extends EventTypeOf<TMap>,
> = Event<PayloadOf<TMap, TType>> & { readonly type: TType };

/** Everything `publishEvent` accepts besides the type and payload. */
export type TypedPublishOptions = PublishOptions & {
  readonly id?: string;
  readonly source?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
};

/**
 * An `EventBus` whose subscribe and publish methods are checked against
 * a payload map. Created with {@link createTypedEventBus}.
 */
export interface TypedEventBus<TMap extends EventPayloadMap> {
  /** The underlying bus, for everything the typed view does not cover. */
  readonly bus: EventBus;

  /** Subscribes to one event type; the handler receives its payload type. */
  on<TType extends EventTypeOf<TMap>>(
    eventType: TType,
    handler: EventHandlerLike<TypedEvent<TMap, TType>>,
    options?: Omit<EventHandlerOptions, "eventType">,
  ): EventSubscription;

  /** Subscribes to one event type for a single delivery. */
  once<TType extends EventTypeOf<TMap>>(
    eventType: TType,
    handler: EventHandlerLike<TypedEvent<TMap, TType>>,
    options?: Omit<EventHandlerOptions, "eventType" | "once">,
  ): EventSubscription;

  /** Subscribes to every event in the map; narrow on `event.type`. */
  onAny(
    handler: EventHandlerLike<EventUnion<TMap>>,
    options?: Omit<EventHandlerOptions, "eventType">,
  ): EventSubscription;

  /** Publishes an event whose payload must match its type. */
  publish<TType extends EventTypeOf<TMap>>(
    eventType: TType,
    payload: PayloadOf<TMap, TType>,
    options?: TypedPublishOptions,
  ): Promise<EventPublishResult<TypedEvent<TMap, TType>>>;
}

/**
 * Wraps a bus in a {@link TypedEventBus} for payload map `TMap`.
 *
 * The wrapper adds no runtime behaviour: handlers and events go straight to
 * `bus`, and the bus can still be used untyped alongside it.
 *
 * @example
 * ```ts
 * interface OrderEvents {
 *   "order.placed": { orderId: string; total: number };
 *   "stock.low": { sku: string };
 * }
 *
 * const orders = createTypedEventBus<OrderEvents>(createEventBus());
 *
 * orders.on("order.placed", (event) => event.payload.total); // number
 * await orders.publish("stock.low", { sku: "A1" });
 * ```
 */
export function createTypedEventBus<TMap extends EventPayloadMap>(
  bus: EventBus,
): TypedEventBus<TMap> {
  return Object.freeze({
    bus,

    on(eventType, handler, options) {
      return bus.on(eventType, handler as EventHandlerLike, options);
    },

    once(eventType, handler, options) {
      return bus.once(eventType, handler as EventHandlerLike, options);
    },

    onAny(handler, options) {
      return bus.onAny(handler as EventHandlerLike, options);
    },

    async publish(eventType, payload, options = {}) {
      const { id, source, correlationId, causationId, ...publishOptions } =
        options;

      const result = await bus.publishEvent(
        { type: eventType, payload, id, source, correlationId, causationId },
        publishOptions,
      );

      return result as unknown as EventPublishResult<
        TypedEvent<TMap, typeof eventType>
      >;
    },
  } satisfies TypedEventBus<TMap>);
}
