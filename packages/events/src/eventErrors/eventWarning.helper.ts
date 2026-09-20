/**
 * Process-level warning sink for @zudojs/events.
 *
 * @module eventErrors/eventWarning
 */

/** Warning code for a registry or emitter handler-limit breach. */
export const EVENT_HANDLER_LIMIT_WARNING_CODE = "ZUDOJS_EVENTS_HANDLER_LIMIT";

/** Warning code for a bus or registry observer that threw. */
export const EVENT_OBSERVER_ERROR_WARNING_CODE =
  "ZUDOJS_EVENTS_OBSERVER_ERROR";

/**
 * Emits a diagnostic on Node's process warning channel — the same one
 * `EventEmitter` uses for `MaxListenersExceededWarning`, so it honours
 * `--no-warnings` and `process.on("warning")` instead of writing to the
 * console. A no-op where `process.emitWarning` is unavailable.
 *
 * @param message - The warning text, emitted with a package prefix.
 * @param code - The machine-readable warning code.
 */
export function emitEventsWarning(message: string, code: string): void {
  const emit = (
    globalThis as {
      readonly process?: {
        readonly emitWarning?: (
          message: string,
          options: { readonly type: string; readonly code: string },
        ) => void;
      };
    }
  ).process?.emitWarning;

  emit?.(`[@zudojs/events] ${message}`, {
    type: "ZudojsEventsWarning",
    code,
  });
}

/**
 * Default sink for an observer that threw: with no `onError` hook
 * configured the failure would otherwise be swallowed entirely.
 *
 * @param error - The value the observer threw.
 * @param source - A short description of which observer channel failed.
 */
export function warnObserverError(error: unknown, source: string): void {
  const detail = error instanceof Error ? error.message : String(error);

  emitEventsWarning(
    `${source} threw and was ignored: ${detail}. ` +
      "Configure the `onError` option to handle observer failures.",
    EVENT_OBSERVER_ERROR_WARNING_CODE,
  );
}
