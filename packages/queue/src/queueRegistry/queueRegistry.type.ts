import type { QueueName } from "../jobTypes/jobTypes.type.js";

import type { Queue } from "../queue/queue.type.js";

/**
 * Information about a registered queue.
 */
export interface QueueInfo {
  /** Queue name. */
  readonly name: QueueName;
  /** When the queue was registered. */
  readonly registeredAt: Date;
  /** Queue options. */
  readonly options?: Record<string, unknown>;
}

/**
 * Registry for queue instances.
 */
export interface QueueRegistry {
  /** Close every registered queue and clear the registry. */
  closeAll(): Promise<void>;
  /** Register a queue. */
  register<TData>(queue: Queue<TData>): void;
  /** Get a queue by name. */
  get<TData>(name: QueueName): Queue<TData> | undefined;
  /** Check if a queue is registered. */
  has(name: QueueName): boolean;
  /** Get all registered queue info. */
  getAll(): QueueInfo[];
  /** Remove a queue. */
  unregister(name: QueueName): boolean;
  /** Clear all queues. */
  clear(): void;
}
