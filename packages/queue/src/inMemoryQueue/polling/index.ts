/**
 * @zudojs/queue/inMemoryQueue/polling
 *
 * The in-memory queue's poll loop and job selection: a fixed or backing-off
 * interval, immediate wake-ups when work arrives, keep-alive while work a
 * consumer can run is pending, and runnable-time ordering.
 */

export * from "./inMemoryQueue.poller.js";
export * from "./inMemoryQueue.select.js";
