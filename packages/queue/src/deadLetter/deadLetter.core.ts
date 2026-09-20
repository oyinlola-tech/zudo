import type { Job } from "../job/job.type.js";

import type { JobId } from "../jobTypes/jobTypes.type.js";

import type { DeadLetterJob, DeadLetterStore } from "./deadLetter.type.js";

import { toQueueError } from "@zudojs/errors";

/**
 * Dead-lettered jobs retained by the in-memory store when no cap is given.
 *
 * Mirrors the queue's own `DEFAULT_RETAINED_JOBS`: the dead letter store
 * keeps a full copy of every failed job — payload, metadata and error — so an
 * unbounded one grows for the life of the process at whatever the failure
 * rate happens to be.
 */
export const DEFAULT_DEAD_LETTER_JOBS = 1_000;

/**
 * Options for {@link createInMemoryDeadLetterStore}.
 */
export interface InMemoryDeadLetterStoreOptions {
  /**
   * Maximum number of dead-lettered jobs retained before the oldest are
   * evicted. Defaults to {@link DEFAULT_DEAD_LETTER_JOBS}. Pass
   * `Number.POSITIVE_INFINITY` for the previous unbounded behaviour.
   */
  readonly maxEntries?: number;
}

/**
 * Creates an in-memory dead letter store.
 *
 * Retention is bounded: past `maxEntries` the oldest entry is evicted, so a
 * long-lived queue with a steady failure rate does not grow without limit.
 *
 * @param options - Retention options.
 */
export function createInMemoryDeadLetterStore<TData = unknown>(
  options?: InMemoryDeadLetterStoreOptions,
): DeadLetterStore<TData> {
  const store = new Map<JobId, DeadLetterJob<TData>>();
  const configured = options?.maxEntries ?? DEFAULT_DEAD_LETTER_JOBS;
  const maxEntries = configured > 0 ? configured : DEFAULT_DEAD_LETTER_JOBS;

  return {
    async add(deadLetterJob: DeadLetterJob<TData>): Promise<void> {
      // Re-inserting an existing id must not count as a new entry, so
      // delete first: a Map keeps its original insertion order otherwise,
      // which would also evict the wrong entry.
      store.delete(deadLetterJob.job.id);
      store.set(deadLetterJob.job.id, deadLetterJob);

      while (store.size > maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest === undefined) break;
        store.delete(oldest);
      }
    },

    async get(jobId: JobId): Promise<DeadLetterJob<TData> | null> {
      return store.get(jobId) ?? null;
    },

    async getAll(): Promise<DeadLetterJob<TData>[]> {
      return Array.from(store.values());
    },

    async remove(jobId: JobId): Promise<boolean> {
      return store.delete(jobId);
    },

    async clear(): Promise<void> {
      store.clear();
    },
  };
}

/**
 * Moves a failed job to the dead letter store.
 */
export async function moveToDeadLetter<TData>(
  store: DeadLetterStore<TData>,
  job: Job<TData>,
  error: Error,
  options?: { reason?: string },
): Promise<void> {
  const deadLetterJob: DeadLetterJob<TData> = {
    job,
    deadLetterAt: new Date(),
    error: toQueueError(error, {
      queueName: job.queueName,
      jobId: job.id,
    }),
    attempts: job.attempt,
    reason: options?.reason,
  };

  await store.add(deadLetterJob);
}
