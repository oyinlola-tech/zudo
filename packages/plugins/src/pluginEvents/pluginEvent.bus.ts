import type {
  PluginEventBus,
  PluginEvents,
  PluginEventSource,
} from "../pluginTypes/pluginContext.type.js";

/** A plugin-events handler, as {@link PluginEvents.on} receives it. */
type PluginEventHandler = (event: unknown) => void;

/**
 * Whether an event source is an event bus (such as `@zudojs/events`'
 * `EventBus`) rather than a {@link PluginEvents} sink.
 *
 * A bus publishes objects (`publishEvent({ type, payload })`); a sink
 * emits a name and a payload. Calling a bus's `emit` with a bare name
 * throws `InvalidEventError`, so the two must be told apart.
 */
export function isPluginEventBus(
  source: PluginEventSource,
): source is PluginEventBus {
  return (
    typeof (source as Partial<PluginEventBus>).publishEvent === "function"
  );
}

/**
 * Adapts an event bus to the {@link PluginEvents} interface plugins use.
 *
 * - `emit(name, payload)` publishes `{ type: name, payload }` and returns
 *   the publish promise, so a rejection can be caught by the caller.
 * - `on(name, handler)` subscribes on the bus and hands the handler the
 *   event's `payload` — the same value a sink's `emit` would pass.
 * - `off(name, handler)` cancels that subscription.
 *
 * A {@link PluginEvents} sink is returned unchanged.
 *
 * @param source - An event bus or a plugin events sink.
 * @returns A {@link PluginEvents} view of it.
 */
export function toPluginEvents(source: PluginEventSource): PluginEvents {
  if (!isPluginEventBus(source)) return source;

  const bus = source;
  const subscriptions = new Map<
    string,
    Map<PluginEventHandler, { unsubscribe(): void }>
  >();

  return {
    on(event, handler) {
      const byHandler = subscriptions.get(event) ?? new Map();
      subscriptions.set(event, byHandler);
      if (byHandler.has(handler)) return;
      byHandler.set(
        handler,
        bus.on(event, (published) => {
          handler(published.payload);
        }),
      );
    },

    off(event, handler) {
      const byHandler = subscriptions.get(event);
      const subscription = byHandler?.get(handler);
      if (!byHandler || !subscription) return;
      subscription.unsubscribe();
      byHandler.delete(handler);
      if (byHandler.size === 0) subscriptions.delete(event);
    },

    emit(event, payload) {
      return bus.publishEvent({ type: event, payload });
    },
  };
}
