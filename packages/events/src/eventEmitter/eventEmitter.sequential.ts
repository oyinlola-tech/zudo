/**
 * Sequential event handler dispatch for Zudojs.
 */

import type { Event } from "../eventTypes/eventDefinition.type.js";

import type {
  EventHandlerContext,
  RegisteredEventHandler,
} from "../eventHandler/eventHandler.core.js";

import { executeRegisteredEventHandler } from "../eventHandler/eventHandler.core.js";

import {
  createEventHandlerError,
  type EventHandlerError,
} from "../eventErrors/eventError.base.js";

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
 *
 * Rejects with EventDispatchAbortedError when the dispatch signal is
 * aborted before a handler starts or while any handler — including
 * the last or only one — is running, even if that handler then
 * returns normally.
 */
export async function emitSequential<TEvent extends Event>(
  handlers: readonly RegisteredEventHandler<TEvent>[],
  event: TEvent,
  context: EventHandlerContext<TEvent>,
  errorMode: EventErrorMode,
  results: EventHandlerExecutionResult[],
  errors: EventHandlerError[],
  hooks: DispatchHooks,
): Promise<void> {
  for (const handler of handlers) {
    if (context.signal.aborted) {
      throw createAbortError(event, results, errors);
    }

    // Checked for every handler, not only once-handlers: a handler
    // unsubscribed (or a bus disposed) by an earlier handler in this
    // same dispatch must not run.
    if (!hooks.isRegistered(handler.id)) {
      continue;
    }

    if (handler.once) {
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

  // The check at the top of the loop only runs before the *next*
  // handler, so an abort during the last (or only) handler used to
  // resolve as a normal, successful dispatch — while the same abort
  // with a handler still to come rejected.
  if (context.signal.aborted) {
    throw createAbortError(event, results, errors);
  }
}
