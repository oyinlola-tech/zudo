import type { JobId, QueueName } from "../jobTypes/jobTypes.type.js";

import type { Job } from "../job/job.type.js";

import type { JobOptions } from "../jobOptions/jobOptions.type.js";

import type { Processor } from "../processor/processor.type.js";

import type { Serializer } from "../serializer/serializer.type.js";

import type { QueueMiddleware } from "../middleware/middleware.type.js";

import type { QueueEventEmitter } from "../queueEmitter/queueEmitter.type.js";

import type { QueueContextCarrier } from "../contextCarrier/contextCarrier.type.js";

import type {
  DeadLetterJob,
  DeadLetterStore,
} from "../deadLetter/deadLetter.type.js";

/**
 * Somewhere for a job to write a log line.
 *
 * Structurally compatible with `@zudojs/logger` and with `console`.
 */
export interface QueueLogger {
  info(message: string, data?: Record<string, unknown>): void;
  /** Receives failures that have no caller to reject (poll errors). */
  error?(message: string, data?: Record<string, unknown>): void;
}

/**
 * Options for creating a queue.
 */
export interface QueueOptions {
  /**
   * Receives lines a processor writes with `context.log()`.
   *
   * Without one, `JobContext.log` is a documented method that discards
   * everything handed to it.
   */
  readonly logger?: QueueLogger;
  /** Queue concurrency limit. */
  readonly concurrency?: number;
  /** Default job options. */
  readonly defaultJobOptions?: Partial<JobOptions>;
  /**
   * Serializer for job payloads. Defaults to `JsonSerializer`, which
   * round-trips `Date`, `BigInt`, `Map`, `Set`, `Uint8Array` and `Error`.
   */
  readonly serializer?: Serializer;
  /** Middleware for job processing. */
  readonly middleware?: QueueMiddleware[];
  /**
   * Milliseconds between polls of the queue's own consumer.
   *
   * When set, every poll uses it. When unset, polls start at 50 ms and back
   * off to 2000 ms while the queue is idle. Either way the poller does not
   * wait for its next poll when work arrives: `add()`, a delayed job coming
   * due, a retry's backoff elapsing, `resume()` and a job finishing all wake
   * it immediately.
   */
  readonly pollInterval?: number;
  /**
   * Whether pending work holds the Node.js process open. Defaults to `true`:
   * while the queue has waiting, delayed, retrying or running jobs that one of
   * its processors can run, its poll timer is referenced, so a script whose
   * only work is the queue does not exit before the jobs run. An idle queue,
   * a paused one, work no processor handles, and a closed queue never hold it.
   * Set to `false` to leave every timer unreferenced.
   */
  readonly keepAlive?: boolean;
  /**
   * Event emitter for queue lifecycle events. Defaults to an in-memory
   * emitter, reachable as `queue.events`.
   */
  readonly eventEmitter?: QueueEventEmitter;
  /**
   * Store that receives jobs which exhausted their attempts.
   *
   * Any store is accepted without an annotation: the untyped
   * `createInMemoryDeadLetterStore()` and one typed for the queue's payload,
   * `createInMemoryDeadLetterStore<TData>()`. (1.4.0 typed this
   * `DeadLetterStore<never>`, which rejected both.)
   */
  readonly deadLetterStore?: DeadLetterStore<unknown>;
  /**
   * Whether `add()` rejects while the queue is paused.
   *
   * Defaults to `true`. Set to `false` for the conventional
   * producer/consumer split, where pausing stops consumption only and
   * producers may keep enqueuing.
   */
  readonly pauseRejectsAdd?: boolean;
  /**
   * Whether job payloads are round-tripped through the serializer on
   * `add()`. Defaults to `true`, which isolates stored payloads from
   * later caller mutation and rejects non-serializable payloads up
   * front. Set to `false` to store payloads by reference.
   */
  readonly serializePayloads?: boolean;
  /**
   * Number of terminal (completed, failed, dead-lettered) jobs retained
   * before the oldest are evicted. Defaults to 1000. Without a bound the
   * queue grows for the life of the process.
   */
  readonly retainSettledJobs?: number;
  /**
   * How long `close()` waits for in-flight jobs before aborting them,
   * in milliseconds. Defaults to 30000.
   */
  readonly closeTimeout?: number;
  /**
   * How long a job may sit in `active` without a live consumer before it
   * is reclaimed, in milliseconds. Defaults to `0` (disabled).
   *
   * Guards against a consumer that claimed a job and then died, which
   * would otherwise leave the job `active` with nothing able to retry
   * it.
   */
  readonly stalledAfter?: number;
  /**
   * How many times a job may stall before it is dead-lettered instead of
   * reclaimed again. Defaults to 3.
   */
  readonly maxStalledCount?: number;
  /**
   * Whether the queue's own poller claims and runs jobs. Defaults to
   * `true`. Creating a `Worker` for the queue turns it off, so the worker —
   * with its middleware, timeout and concurrency — is the only consumer.
   */
  readonly autoProcess?: boolean;
  /**
   * After a job times out, how long its concurrency slot and its retry wait
   * for the processor to actually settle, in milliseconds. Defaults to 5000.
   *
   * A timeout aborts `context.signal`; a processor that ignores the signal
   * keeps running. Without the wait, the retry started beside it and one
   * job ran several times at once. Past this grace the processor is
   * abandoned and the job fails anyway, so processors must honour the
   * signal.
   */
  readonly timeoutGraceMs?: number;
  /**
   * Context carried from `add()` into the processor (tenant, correlation
   * id, trace ids). See {@link QueueContextCarrier}.
   */
  readonly contextCarriers?: readonly QueueContextCarrier[];
  /**
   * Source of randomness for retry jitter, returning a number in `[0, 1)`.
   * Defaults to `Math.random`; inject a seeded function to make a jittered
   * backoff reproducible in tests.
   */
  readonly random?: () => number;
}

/**
 * Statistics for a queue.
 */
export interface QueueStats {
  /** Number of waiting jobs. */
  readonly waiting: number;
  /** Number of active jobs. */
  readonly active: number;
  /** Number of completed jobs. */
  readonly completed: number;
  /** Number of failed jobs. */
  readonly failed: number;
  /** Number of delayed jobs. */
  readonly delayed: number;
  /** Number of retrying jobs. */
  readonly retrying: number;
  /** Total jobs dispatched over the queue's lifetime. */
  readonly processed: number;
  /** Total jobs that completed successfully. */
  readonly succeeded: number;
  /** Total jobs that failed terminally. */
  readonly errored: number;
  /** Total retry attempts scheduled. */
  readonly retried: number;
  /** Total jobs moved to the dead letter store. */
  readonly deadLettered: number;
}

/**
 * A named stream of jobs.
 */
export interface Queue<TData = unknown> {
  /** Queue name. */
  readonly name: QueueName;
  /**
   * The emitter this queue publishes lifecycle events on, when it has one.
   *
   * Exposed so a `Worker` can report its own lifecycle
   * (`worker:started`, `worker:stopped`, `worker:error`) on the same
   * emitter as the jobs it runs.
   */
  readonly events?: QueueEventEmitter;
  /** Add a job to the queue. */
  add(name: string, data: TData, options?: JobOptions): Promise<Job<TData>>;
  /** Process jobs with a processor. */
  process(name: string, processor: Processor<TData>): void;
  /** Get a job by ID. */
  getJob(jobId: JobId): Promise<Job<TData> | null>;
  /**
   * Peeks at the job that would be processed next, without claiming it.
   *
   * Consumers that intend to run the job must use {@link claimNextJob};
   * peeking leaves the job `waiting`, so two consumers polling with this
   * method would both run it.
   */
  getNextJob(): Promise<Job<TData> | null>;
  /**
   * Atomically claims the next runnable job, marking it `active`.
   *
   * Returns `null` when nothing is runnable — including when a waiting
   * job has no registered processor.
   */
  claimNextJob(): Promise<Job<TData> | null>;
  /**
   * Returns a claimed job to the waiting pool.
   *
   * Used when a consumer claims a job it turns out it cannot run, so the
   * job is retried by another consumer rather than stranded in `active`.
   */
  releaseJob(jobId: JobId): Promise<boolean>;
  /**
   * Runs an already-claimed job through the queue's processing pipeline.
   *
   * The queue owns job state, so consumers must dispatch through this
   * rather than invoking a processor themselves — doing so would leave
   * the job stuck in `active` and skip retry, dead-lettering and
   * middleware.
   */
  runJob(
    job: Job<TData>,
    options?: {
      middleware?: readonly QueueMiddleware[];
      signal?: AbortSignal;
      /** Fallback timeout for a job that carries none of its own. */
      timeoutMs?: number;
    },
  ): Promise<void>;
  /** Get a registered processor by job name. */
  getProcessor(name: string): Processor<TData> | undefined;
  /** Get queue statistics. */
  getStats(): Promise<QueueStats>;
  /** Pause the queue. */
  pause(): Promise<void>;
  /** Resume the queue. */
  resume(): Promise<void>;
  /** Check if the queue is paused. */
  isPaused(): boolean;
  /** Check if the queue has been closed. */
  isDisposed(): boolean;
  /** Get the jobs that exhausted their attempts. */
  getDeadLetterJobs(): Promise<readonly DeadLetterJob<TData>[]>;
  /** Close the queue, draining in-flight jobs first. */
  close(): Promise<void>;
  /**
   * Turns the queue's own poller on or off as a consumer. `createWorker`
   * turns it off so a worker is never racing the queue for jobs.
   */
  setAutoProcess?(enabled: boolean): void;
  /**
   * Subscribes to "a job may have become runnable" (added, released,
   * reclaimed, a delay or retry backoff elapsed, the queue resumed). A
   * `Worker` uses it to claim at once instead of on its next poll; a queue
   * without it is simply polled.
   *
   * @returns A function that unsubscribes.
   */
  onJobReady?(listener: () => void): () => void;
}

/**
 * Event types emitted by a queue.
 */
export type QueueEventMap = {
  "job:created": { job: Job };
  "job:started": { job: Job };
  "job:progress": { job: Job; progress: number };
  "job:completed": { job: Job; result: unknown };
  /**
   * An attempt failed. Fires on every failed attempt, retryable or final;
   * `job.state` is `"failed"` for a processor failure either way. Use
   * `job:retrying` or `job:dead-lettered` to tell the two apart.
   */
  "job:failed": { job: Job; error: Error };
  "job:retrying": { job: Job; attempt: number };
  /**
   * The job was moved to the dead-letter store (attempts exhausted, or
   * stalled `maxStalledCount` times). Fires once per job, after the
   * `job:failed` for its last attempt; `job.state` is `"dead_letter"` and
   * `error` / `reason` are the dead-letter entry's.
   */
  "job:dead-lettered": { job: Job; error: Error; reason?: string };
  /** A running job was aborted from outside — a drain, a close, a cancel. */
  "job:cancelled": { job: Job };
  "worker:started": { workerId: string };
  "worker:stopped": { workerId: string };
  "worker:error": { workerId: string; error: Error };
};
