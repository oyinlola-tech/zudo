import type { Processor } from "../processor/processor.type.js";

import type { Queue } from "../queue/queue.type.js";

import type { QueueMiddleware } from "../middleware/middleware.type.js";

import type { WorkerState } from "../jobTypes/jobTypes.type.js";

/**
 * Options for creating a worker.
 */
export interface WorkerOptions {
  /** Maximum number of jobs to process concurrently. */
  readonly concurrency?: number;
  /** Poll interval in milliseconds. */
  readonly pollInterval?: number;
  /**
   * Default job timeout in milliseconds, applied to jobs that do not
   * carry their own. Stall detection is a queue-level concern; configure
   * it with `QueueOptions.stalledAfter` and `maxStalledCount`.
   */
  readonly timeoutMs?: number;
  /** Middleware for job processing. */
  readonly middleware?: QueueMiddleware[];
  /**
   * How long `stop()` waits for in-flight jobs before forcing a stop, in
   * milliseconds. Defaults to 30000. Without a bound, one stuck job
   * hangs shutdown forever.
   */
  readonly drainTimeout?: number;
  /**
   * Invoked for errors raised outside a job — a failing poll, a job that
   * threw, or a drain that timed out. Defaults to reporting on the
   * console. Poll errors are never left as unhandled rejections.
   */
  readonly onError?: (error: unknown) => void;
}

/**
 * Worker lifecycle states.
 */
export type WorkerLifecycleState = WorkerState;

/**
 * A worker that processes jobs from a queue.
 */
export interface Worker<TData = unknown> {
  /** Worker ID. */
  readonly id: string;
  /** Queue this worker processes jobs from. */
  readonly queue: Queue<TData>;
  /** Queue name. */
  readonly queueName: string;
  /** Current worker state. */
  readonly state: WorkerLifecycleState;
  /** Start processing jobs. */
  start(): Promise<void>;
  /** Stop processing jobs gracefully. */
  stop(): Promise<void>;
  /** Force stop processing jobs. */
  forceStop(): Promise<void>;
  /** Check if the worker is running. */
  isRunning(): boolean;
  /** Get worker statistics. */
  getStats(): WorkerStats;
}

/**
 * Worker statistics.
 */
export interface WorkerStats {
  /** Number of jobs processed. */
  readonly processed: number;
  /** Number of successful jobs. */
  readonly succeeded: number;
  /** Number of failed jobs. */
  readonly failed: number;
  /** Current concurrency. */
  readonly concurrency: number;
  /** Worker state. */
  readonly state: WorkerLifecycleState;
}
