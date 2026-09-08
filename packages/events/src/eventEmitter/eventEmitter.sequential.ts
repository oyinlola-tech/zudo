/**
 * Sequential event handler dispatch for Zudojs.
 */

import type { Event } from "../eventTypes/eventDefinition.type.js";

import type {
  EventHandlerContext,
  RegisteredEventHandler,
} from "../eventHandler/eventHandler.core.js";

import { executeRegisteredEventHandler } from "../eventHandler/eventHandler.core.js";

import { createEventHandlerError } from "../eventErrors/eventError.base.js";

import type { EventHandlerExecutionResult } from "./eventEmitter.type.js";

import { EventErrorMode } from "./eventEmitter.type.js";

import { createAbortError } from "./eventEmitter.abort.js";

/**
 * Callbacks the dispatch strategies use to interact with the
 * handler store.
 */
export interface DispatchHooks {
  /**
   * Returns whether a handler is still registered.
   */
  readonly isRegistered: (handlerId: string) => boolean;

  /**
   * Removes a once-handler. Called before the handler runs so a
   * throwing or concurrently dispatched once-handler never fires
   * twice.
   */
  readonly removeOnce: (handlerId: string) => void;
}

/**
 * Executes handlers sequentially.
 */
export async function emitSequential<TEvent extends Event>(
  handlers: readonly RegisteredEventHandler<TEvent>[],
  event: TEvent,
  context: EventHandlerContext<TEvent>,
  errorMode: EventErrorMode,
  results: EventHandlerExecutionResult[],
  errors: unknown[],
  hooks: DispatchHooks,
): Promise<void> {
  for (const handler of handlers) {
    if (context.signal.aborted) {
      throw createAbortError(event, results, errors);
    }

    if (handler.once) {
      if (!hooks.isRegistered(handler.id)) {
        // Already consumed by an overlapping dispatch.
        continue;
      }

      hooks.removeOnce(handler.id);
    }

    const started = performance.now();

    try {
      const result = await executeRegisteredEventHandler(
        handler,
        event,
        context,
      );

      results.push({
        handlerId: handler.id,

        eventId: event.id,

        ok: true,

        result,

        duration: performance.now() - started,
      });
    } catch (error) {
      results.push({
        handlerId: handler.id,

        eventId: event.id,

        ok: false,

        result: undefined,

        duration: performance.now() - started,

        error,
      });

      const wrapped = createEventHandlerError(
        handler.id,
        event.type,
        event.id,
        error,
      );

      errors.push(wrapped);

      if (errorMode === EventErrorMode.THROW) {
        throw wrapped;
      }
    }
  }
}
