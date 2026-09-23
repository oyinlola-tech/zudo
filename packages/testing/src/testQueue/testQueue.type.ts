import type { InMemoryQueue, Job, Queue } from "@zudojs/queue";

/**
 * A recorded job addition.
 */
export interface RecordedJob<TData = unknown> {
  readonly job: Job<TData>;
  readonly timestamp: Date;
}

/**
 * A test queue: a `Queue` (so it can be handed to any code that takes
 * one) backed by a real `InMemoryQueue`, recording every job added to it,
 * whether `add` is called on the test queue or on the underlying `queue`.
 */
export interface TestQueue<TData = unknown> extends Queue<TData> {
  /** The underlying `InMemoryQueue`; `add` on it records too. */
  readonly queue: InMemoryQueue<TData>;

  /**
   * All recorded jobs, oldest first.
   */
  readonly jobs: readonly RecordedJob<TData>[];

  /**
   * Find jobs by name.
   */
  findByName(name: string): readonly RecordedJob<TData>[];

  /**
   * Clear recorded jobs.
   */
  clear(): void;
}
