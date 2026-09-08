import type { QueueName } from "../jobTypes/jobTypes.type.js";

import type { Queue, QueueOptions } from "../queue/queue.type.js";

import type { QueueManager } from "./queueManager.type.js";

import { QueueError } from "@zudojs/errors";

import { createQueue } from "../queue/queue.core.js";

/**
 * Creates a new QueueManager.
 */
export function createQueueManager(): QueueManager {
  const queues = new Map<QueueName, Queue>();

  return {
    /**
     * Returns the queue with this name, creating it on first request.
     *
     * `options` apply only when the queue is created. Passing different
     * options for an existing queue throws rather than silently
     * returning a queue configured some other way.
     */
    getQueue<TData>(name: QueueName, options?: QueueOptions): Queue<TData> {
      const existing = queues.get(name) as Queue<TData> | undefined;

      if (existing) {
        if (options !== undefined) {
          throw new QueueError(
            `Queue "${name}" already exists; options are only applied when a queue is created.`,
            { queueName: name },
          );
        }
        return existing;
      }

      const queue = createQueue<TData>(name, options);
      queues.set(name, queue as Queue);
      return queue;
    },

    getExistingQueue<TData>(name: QueueName): Queue<TData> | undefined {
      return queues.get(name) as Queue<TData> | undefined;
    },

    hasQueue(name: QueueName): boolean {
      return queues.has(name);
    },

    getQueueNames(): QueueName[] {
      return Array.from(queues.keys());
    },

    /**
     * Closes every queue, clearing the registry even if some fail.
     */
    async closeAll(): Promise<void> {
      const closePromises = Array.from(queues.values()).map((queue) =>
        queue.close(),
      );
      queues.clear();

      const results = await Promise.allSettled(closePromises);
      const failure = results.find((result) => result.status === "rejected");

      if (failure && failure.status === "rejected") {
        throw failure.reason;
      }
    },
  };
}
