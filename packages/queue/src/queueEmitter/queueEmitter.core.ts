import type { QueueEventEmitter } from "./queueEmitter.type.js";

import type { QueueEventMap, QueueLogger } from "../queue/queue.type.js";
import { reportQueueError } from "../queue/queue.report.js";

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
  /**
   * Receives a throwing listener's error when no `onHandlerError` is given.
   * Without one the failure goes to `process.emitWarning`, bypassing
   * structured logging and redaction.
   */
  readonly logger?: QueueLogger;
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

  /** Whether `onHandlerError` was supplied, so `setLogger` leaves it alone. */
  private readonly hasCustomHandlerError: boolean;

  private logger: QueueLogger | undefined;

  public constructor(options: QueueEventEmitterOptions = {}) {
    this.hasCustomHandlerError = options.onHandlerError !== undefined;
    this.logger = options.logger;
    this.onHandlerError =
      options.onHandlerError ??
      ((error, event) => {
        queueMicrotask(() => {
          reportQueueError(
            `[@zudojs/queue] Listener for "${event}" threw.`,
            error,
            this.logger,
          );
        });
      });
  }

  /**
   * Adopts a logger for the default handler-error report.
   *
   * Called by a queue that was configured with a logger, since the emitter is
   * built before the queue exists and cannot have been given it. A logger or
   * an `onHandlerError` supplied at construction always wins.
   *
   * @param logger - Destination for a throwing listener's error.
   */
  setLogger(logger: QueueLogger): void {
    if (this.hasCustomHandlerError || this.logger) return;
    this.logger = logger;
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
