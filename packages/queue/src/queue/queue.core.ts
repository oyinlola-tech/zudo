import type { QueueName } from "../jobTypes/jobTypes.type.js";

import type { Queue, QueueOptions, QueueStats } from "./queue.type.js";

import { createInMemoryQueue } from "../inMemoryQueue/index.js";

/**
 * Creates a new queue.
 *
 * @deprecated Use `createInMemoryQueue` instead for the full in-memory implementation.
 */
export function createQueue<TData>(
  name: QueueName,
  options?: QueueOptions,
): Queue<TData> {
  return createInMemoryQueue<TData>(name, options);
}

/**
 * Checks if a value is a valid Queue.
 */
export function isQueue(value: unknown): value is Queue {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "add" in value &&
    "process" in value &&
    "getJob" in value &&
    "getNextJob" in value &&
    "claimNextJob" in value
  );
}
