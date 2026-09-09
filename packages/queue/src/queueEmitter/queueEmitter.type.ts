import type { QueueEventMap } from "../queue/queue.type.js";

/**
 * Emitter for queue lifecycle events.
 *
 * Provides a simple event emission interface that can be
 * implemented by different backends (in-memory, @zudojs/events, etc.).
 */
export interface QueueEventEmitter {
  /** Emit an event. */
  emit<K extends keyof QueueEventMap>(event: K, data: QueueEventMap[K]): void;
  /** Subscribe to an event. */
  on<K extends keyof QueueEventMap>(
    event: K,
    handler: (data: QueueEventMap[K]) => void,
  ): () => void;
}
