/**
 * Test queue helpers.
 *
 * Wraps the real InMemoryQueue with recording and assertion support.
 */

import { createInMemoryQueue, InMemoryQueue } from "@zudojs/queue";

import type {
  Job,
  QueueName,
  QueueOptions,
  QueueStats,
  JobOptions,
} from "@zudojs/queue";

/**
 * A recorded job addition.
 */
export interface RecordedJob<TData = unknown> {
  readonly job: Job<TData>;
  readonly timestamp: Date;
}

/**
 * A test queue with recording capabilities.
 */
export interface TestQueue<TData = unknown> {
  readonly queue: InMemoryQueue<TData>;

  /**
   * All recorded jobs.
   */
  readonly jobs: readonly RecordedJob<TData>[];

  /**
   * Add a job and record it.
   */
  add: (name: string, data: TData, options?: JobOptions) => Promise<Job<TData>>;

  /**
   * Find jobs by name.
   */
  findByName: (name: string) => readonly RecordedJob<TData>[];

  /**
   * Get all job states.
   */
  getStats: () => Promise<QueueStats>;

  /**
   * Clear recorded jobs.
   */
  clear: () => void;

  /**
   * Close the queue.
   */
  close: () => Promise<void>;
}

export function createTestQueue<TData = unknown>(
  name: QueueName,
  options?: QueueOptions,
): TestQueue<TData> {
  const queue = createInMemoryQueue<TData>(
    name,
    options,
  ) as InMemoryQueue<TData>;
  const recordedJobs: RecordedJob<TData>[] = [];

  const add = async (
    jobName: string,
    data: TData,
    jobOptions?: JobOptions,
  ): Promise<Job<TData>> => {
    const job = await queue.add(jobName, data, jobOptions);

    recordedJobs.push({
      job,
      timestamp: new Date(),
    });

    return job;
  };

  const findByName = (name: string): readonly RecordedJob<TData>[] =>
    recordedJobs.filter((r) => r.job.name === name);

  const getStats = async (): Promise<QueueStats> => queue.getStats();

  const clear = (): void => {
    recordedJobs.length = 0;
  };

  const close = async (): Promise<void> => {
    await queue.close();
  };

  return {
    queue,
    get jobs() {
      return [...recordedJobs];
    },
    add,
    findByName,
    getStats,
    clear,
    close,
  };
}
