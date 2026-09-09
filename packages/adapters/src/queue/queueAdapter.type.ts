/**
 * @zudojs/adapters/queue
 *
 * Queue adapter contracts — bridges Zudojs queue to external providers.
 *
 * Examples: BullMQ, RabbitMQ, AWS SQS, Redis, Kafka.
 */

import type { Adapter, AdapterOperationOptions } from "../index.js";

/**
 * Queue adapter — connects Zudojs queue abstractions to external providers.
 */
export interface QueueAdapter extends Adapter {
  /** Enqueues a job. */
  enqueue(job: unknown, options?: AdapterOperationOptions): Promise<string>;

  /** Dequeues a job. */
  dequeue(options?: AdapterOperationOptions): Promise<unknown | null>;

  /** Acknowledges a job as processed. */
  acknowledge(jobId: string, options?: AdapterOperationOptions): Promise<void>;

  /** Rejects a job, optionally requeuing it. */
  reject(
    jobId: string,
    requeue?: boolean,
    options?: AdapterOperationOptions,
  ): Promise<void>;

  /** Returns queue statistics. */
  stats(options?: AdapterOperationOptions): Promise<QueueStats>;
}

/**
 * Queue statistics.
 */
export interface QueueStats {
  readonly waiting: number;
  readonly active: number;
  readonly completed: number;
  readonly failed: number;
  readonly delayed: number;
}
