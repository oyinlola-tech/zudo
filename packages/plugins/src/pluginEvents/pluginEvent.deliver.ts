import type { PluginEvents } from "../pluginTypes/pluginContext.type.js";

/**
 * Emits an event and contains every way delivery can fail.
 *
 * A subscriber that throws synchronously, and an `emit` that returns a
 * promise which later rejects, are both passed to `onFailure` and never
 * propagate: a lifecycle phase must not fail because of a listener, and
 * an unobserved rejection would otherwise surface as an
 * `unhandledRejection` — which terminates Node by default — after the
 * phase has already resolved.
 *
 * @param events - Where to emit.
 * @param name - The event name.
 * @param payload - The event payload.
 * @param onFailure - Receives a synchronous throw or an async rejection.
 */
export function deliverPluginEvent(
  events: PluginEvents,
  name: string,
  payload: unknown,
  onFailure: (error: unknown) => void,
): void {
  let result: unknown;
  try {
    result = events.emit(name, payload);
  } catch (error) {
    onFailure(error);
    return;
  }
  if (isThenable(result)) {
    result.then(undefined, (error: unknown) => {
      try {
        onFailure(error);
      } catch {
        // A throwing failure hook must not become an unhandled rejection.
      }
    });
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
