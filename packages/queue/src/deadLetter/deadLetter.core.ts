import type { Job } from "../job/job.type.js";

import type { JobId } from "../jobTypes/jobTypes.type.js";

import type { DeadLetterJob, DeadLetterStore } from "./deadLetter.type.js";

import { toQueueError } from "@zudojs/errors";

/**
 * Creates an in-memory dead letter store.
 */
export function createInMemoryDeadLetterStore<
  TData = unknown,
>(): DeadLetterStore<TData> {
  const store = new Map<JobId, DeadLetterJob<TData>>();

  return {
    async add(deadLetterJob: DeadLetterJob<TData>): Promise<void> {
      store.set(deadLetterJob.job.id, deadLetterJob);
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
