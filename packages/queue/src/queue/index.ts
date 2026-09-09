/**
 * Queue interface and factory functions.
 *
 * Provides the core Queue type and functions for creating
 * and managing job queues.
 */
export { createQueue, isQueue } from "./queue.core.js";

export type {
  Queue,
  QueueLogger,
  QueueOptions,
  QueueStats,
  QueueEventMap,
} from "./queue.type.js";

export type { QueueEventEmitter } from "../queueEmitter/queueEmitter.type.js";
