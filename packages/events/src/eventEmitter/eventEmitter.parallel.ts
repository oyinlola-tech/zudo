/**
 * Parallel event handler dispatch for Zudojs.
 *
 * All handlers start together; an AbortSignal that fires after
 * the handlers have started cannot stop them. Handlers can observe
 * `context.signal` to cooperate. Only a signal that is already
 * aborted when dispatch begins rejects the emit.
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

import type { DispatchHooks } from "./eventEmitter.sequential.js";

/**
 * Executes handlers concurrently.
 */
export async function emitParallel<TEvent extends Event>(
  handlers: readonly RegisteredEventHandler<TEvent>[],
  event: TEvent,
  context: EventHandlerContext<TEvent>,
  errorMode: EventErrorMode,
  results: EventHandlerExecutionResult[],
  errors: unknown[],
  hooks: DispatchHooks,
): Promise<void> {
  if (context.signal.aborted) {
    throw createAbortError(event, results, errors);
  }

  /**
   * Consume once-handlers synchronously before anything starts so
   * an overlapping dispatch cannot invoke them a second time.
   */
  const runnable = handlers.filter((handler) => {
    if (!handler.once) {
      return true;
    }

    if (!hooks.isRegistered(handler.id)) {
      return false;
    }

    hooks.removeOnce(handler.id);

    return true;
  });

  const executions = runnable.map(
    async (handler): Promise<EventHandlerExecutionResult> => {
      const started = performance.now();

      try {
        const result = await executeRegisteredEventHandler(
          handler,
          event,
          context,
        );

        return {
          handlerId: handler.id,

          eventId: event.id,

          ok: true,

          result,

          duration: performance.now() - started,
        };
      } catch (error) {
        return {
          handlerId: handler.id,

          eventId: event.id,

          ok: false,

          result: undefined,

          duration: performance.now() - started,

          error,
        };
      }
    },
  );

  const settled = await Promise.all(executions);

  for (const result of settled) {
    results.push(result);

    if (!result.ok) {
      errors.push(
        createEventHandlerError(
          result.handlerId,
          event.type,
          event.id,
          result.error,
        ),
      );
    }
  }

  if (errors.length > 0 && errorMode === EventErrorMode.THROW) {
    throw errors[0];
  }
}
