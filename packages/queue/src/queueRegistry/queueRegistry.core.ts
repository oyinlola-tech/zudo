import type { QueueName } from "../jobTypes/jobTypes.type.js";

import type { Queue } from "../queue/queue.type.js";

import type { QueueRegistry, QueueInfo } from "./queueRegistry.type.js";

import { QueueError } from "@zudojs/errors";

/**
 * Creates a new QueueRegistry.
 */
export function createQueueRegistry(): QueueRegistry {
  const queues = new Map<QueueName, Queue>();
  const infoMap = new Map<QueueName, QueueInfo>();

  return {
    register<TData>(queue: Queue<TData>): void {
      if (queues.has(queue.name)) {
        throw new QueueError(`Queue "${queue.name}" is already registered.`, {
          queueName: queue.name,
        });
      }

      queues.set(queue.name, queue as Queue);
      infoMap.set(queue.name, {
        name: queue.name,
        registeredAt: new Date(),
      });
    },

    get<TData>(name: QueueName): Queue<TData> | undefined {
      return queues.get(name) as Queue<TData> | undefined;
    },

    has(name: QueueName): boolean {
      return queues.has(name);
    },

    getAll(): QueueInfo[] {
      return Array.from(infoMap.values());
    },

    unregister(name: QueueName): boolean {
      const queue = queues.get(name);
      const deleted = queues.delete(name);
      infoMap.delete(name);

      // Dropping the reference without closing would leave the queue's
      // poll timer running with nothing able to stop it.
      if (queue) {
        void queue.close().catch(() => {});
      }

      return deleted;
    },

    async closeAll(): Promise<void> {
      const pending = Array.from(queues.values()).map((queue) => queue.close());
      queues.clear();
      infoMap.clear();
      await Promise.allSettled(pending);
    },

    clear(): void {
      for (const queue of queues.values()) {
        void queue.close().catch(() => {});
      }
      queues.clear();
      infoMap.clear();
    },
  };
}
