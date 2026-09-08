import type { QueueEventEmitter } from "./queueEmitter.type.js";

import type { QueueEventMap } from "../queue/queue.type.js";

type EventName = keyof QueueEventMap;

type Handler<T extends EventName> = (data: QueueEventMap[T]) => void;

/**
 * Options for the in-memory queue event emitter.
 */
export interface QueueEventEmitterOptions {
  /**
   * Invoked when a handler throws. Defaults to reporting the error on the
   * next tick so it surfaces in normal error reporting without unwinding
   * the emitting code path.
   */
  readonly onHandlerError?: (error: unknown, event: EventName) => void;
}

/**
 * In-memory queue event emitter.
 *
 * Stores handlers in memory and emits events synchronously. A handler
 * that throws is isolated: the remaining handlers still run, and the
 * failure never propagates back into queue processing, where it would be
 * misreported as a job failure.
 */
export class InMemoryQueueEventEmitter implements QueueEventEmitter {
  private readonly handlers: Map<EventName, Set<Handler<EventName>>> =
    new Map();

  private readonly onHandlerError: (error: unknown, event: EventName) => void;

  public constructor(options: QueueEventEmitterOptions = {}) {
    this.onHandlerError =
      options.onHandlerError ??
      ((error, event) => {
        queueMicrotask(() => {
          console.error(
            `[@zudojs/queue] Listener for "${event}" threw.`,
            error,
          );
        });
      });
  }

  emit<K extends EventName>(event: K, data: QueueEventMap[K]): void {
    const handlers = this.handlers.get(event);
    if (!handlers) {
      return;
    }

    // Snapshot so a handler that subscribes or unsubscribes during
    // dispatch cannot mutate the set being iterated.
    for (const handler of [...handlers]) {
      try {
        handler(data);
      } catch (error) {
        this.onHandlerError(error, event);
      }
    }
  }

  on<K extends EventName>(event: K, handler: Handler<K>): () => void {
    let handlers = this.handlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(event, handlers);
    }

    const registered = handler as Handler<EventName>;
    handlers.add(registered);

    let removed = false;

    return () => {
      if (removed) {
        return;
      }
      removed = true;

      const current = this.handlers.get(event);
      if (!current) {
        return;
      }

      current.delete(registered);
      if (current.size === 0) {
        this.handlers.delete(event);
      }
    };
  }

  /**
   * Removes every registered handler.
   */
  removeAllListeners(): void {
    this.handlers.clear();
  }
}

/**
 * Creates an in-memory queue event emitter.
 */
export function createInMemoryQueueEventEmitter(
  options?: QueueEventEmitterOptions,
): QueueEventEmitter {
  return new InMemoryQueueEventEmitter(options);
}

/**
 * Creates a no-op queue event emitter.
 */
export function createNoopQueueEventEmitter(): QueueEventEmitter {
  return {
    emit(): void {},
    on(): () => void {
      return () => {};
    },
  };
}
