/**
 * Test queue helpers.
 *
 * A real InMemoryQueue that records every job added to it.
 */

import { InMemoryQueue } from "@zudojs/queue";

import type { Job, JobOptions, QueueName, QueueOptions } from "@zudojs/queue";

import type { RecordedJob, TestQueue } from "./testQueue.type.js";

import { RecordingQueueView } from "./testQueue.view.js";

export type { RecordedJob, TestQueue } from "./testQueue.type.js";

/**
 * Creates a test queue that records every job added to it.
 *
 * @param name - Queue name.
 * @param options - Queue options.
 * @returns A TestQueue, which is itself a `Queue`.
 *
 * @example
 * ```ts
 * const reminders = createTestQueue<{ taskId: number }>(createQueueName("reminders"));
 *
 * await scheduler.remind(reminders, 7); // takes a Queue, calls add(...)
 *
 * expect(reminders.findByName("remind")).toHaveLength(1);
 * await reminders.close();
 * ```
 */
export function createTestQueue<TData = unknown>(
  name: QueueName,
  options?: QueueOptions,
): TestQueue<TData> {
  const queue = new InMemoryQueue<TData>(name, options);
  const recorded: RecordedJob<TData>[] = [];

  // Recorded on the queue instance itself, so `testQueue.queue.add(...)`,
  // and code that was handed `queue`, record too.
  const add = queue.add.bind(queue);
  Object.defineProperty(queue, "add", {
    configurable: true,
    writable: true,
    value: async (
      jobName: string,
      data: TData,
      jobOptions?: JobOptions,
    ): Promise<Job<TData>> => {
      const job = await add(jobName, data, jobOptions);
      recorded.push(Object.freeze({ job, timestamp: new Date() }));
      return job;
    },
  });

  return new RecordingQueueView(queue, recorded);
}
