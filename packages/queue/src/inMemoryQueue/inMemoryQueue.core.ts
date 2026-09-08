import { randomUUID } from "node:crypto";
import {
  QueueError,
  QueueDisposedError,
  JobDuplicateError,
  JobSerializationError,
  JobStalledError,
} from "@zudojs/errors";

import type { JobId, QueueName } from "../jobTypes/jobTypes.type.js";
import type { Job } from "../job/job.type.js";
import type { Queue, QueueOptions, QueueStats } from "../queue/queue.type.js";
import type { Processor } from "../processor/processor.type.js";
import type { JobOptions } from "../jobOptions/jobOptions.type.js";
import type { Serializer } from "../serializer/serializer.type.js";
import type { QueueMiddleware } from "../middleware/middleware.type.js";

import { createJob, updateJobState } from "../job/job.core.js";
import {
  JobState as JobStateEnum,
  createJobName,
} from "../jobTypes/jobTypes.type.js";
import { JsonSerializer } from "../serializer/serializer.core.js";
import { createInMemoryDeadLetterStore } from "../deadLetter/deadLetter.core.js";
import { createNoopQueueEventEmitter } from "../queueEmitter/queueEmitter.core.js";
import type { QueueEventEmitter } from "../queueEmitter/queueEmitter.type.js";
import type {
  DeadLetterJob,
  DeadLetterStore,
} from "../deadLetter/deadLetter.type.js";

import { processJob } from "./inMemoryQueue.processing.js";
import type { QueueCounters } from "./inMemoryQueue.processing.js";
import {
  scheduleJob,
  promoteDueScheduledJobs,
} from "./inMemoryQueue.scheduling.js";

/** Terminal states a job never leaves. */
const TERMINAL_STATES: ReadonlySet<JobStateEnum> = new Set([
  JobStateEnum.COMPLETED,
  JobStateEnum.FAILED,
  JobStateEnum.DEAD_LETTER,
  JobStateEnum.CANCELLED,
]);

/** Retained terminal jobs per outcome when no retention is configured. */
const DEFAULT_RETAINED_JOBS = 1_000;

/** How long `close()` waits for in-flight jobs before aborting them. */
const DEFAULT_CLOSE_TIMEOUT_MS = 30_000;

/**
 * In-memory queue implementation.
 *
 * Good for testing, development, and simple applications.
 * Jobs are lost when the application crashes.
 */
export class InMemoryQueue<TData = unknown> implements Queue<TData> {
  readonly name: QueueName;
  private readonly jobs: Map<JobId, Job<TData>> = new Map();
  private readonly processors: Map<string, Processor<TData>> = new Map();
  private readonly options: QueueOptions;
  private readonly serializer: Serializer;
  private readonly middleware: QueueMiddleware[];
  private paused = false;
  private disposed = false;
  private activeCount = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly scheduledTimers: Map<JobId, ReturnType<typeof setTimeout>> =
    new Map();
  private readonly retryTimers: Map<JobId, ReturnType<typeof setTimeout>> =
    new Map();
  private readonly inFlight: Map<JobId, AbortController> = new Map();
  private readonly settledOrder: JobId[] = [];
  /** How many times each job has been reclaimed after stalling. */
  private readonly stalledCounts: Map<JobId, number> = new Map();
  private readonly deduplicationIndex: Map<string, JobId> = new Map();
  private readonly deadLetterStore: DeadLetterStore<TData>;
  private readonly emitter: QueueEventEmitter;

  private readonly counters: QueueCounters = {
    processedCount: 0,
    succeededCount: 0,
    failedCount: 0,
    retriedCount: 0,
    deadLetteredCount: 0,
  };

  private emptySince = 0;

  private backoffMs = 50;

  constructor(name: QueueName, options?: QueueOptions) {
    this.name = name;
    this.options = options ?? {};
    this.serializer = this.options.serializer ?? JsonSerializer;
    this.middleware = this.options.middleware ?? [];
    this.emitter = options?.eventEmitter ?? createNoopQueueEventEmitter();
    this.deadLetterStore =
      this.options.deadLetterStore ?? createInMemoryDeadLetterStore<TData>();
  }

  async add(
    jobName: string,
    data: TData,
    options?: JobOptions,
  ): Promise<Job<TData>> {
    if (this.disposed) throw new QueueDisposedError(this.name);

    // Pausing conventionally stops consumption; whether it also stops
    // production is a policy choice, so it is configurable and defaults
    // to rejecting adds for backwards compatibility.
    if (this.paused && (this.options.pauseRejectsAdd ?? true)) {
      throw new QueueError(`Queue "${this.name}" is paused.`, {
        queueName: this.name,
      });
    }

    const mergedOptions = { ...this.options.defaultJobOptions, ...options };

    if (mergedOptions.deduplicationKey) {
      const existing = this.deduplicationIndex.get(
        mergedOptions.deduplicationKey,
      );
      if (existing && this.jobs.has(existing)) {
        throw new JobDuplicateError(existing, mergedOptions.deduplicationKey, {
          queueName: this.name,
        });
      }
    }

    const jobId = this.createJobId();

    // Round-tripping through the configured serializer keeps the option
    // honest, isolates the stored payload from later caller mutation, and
    // surfaces a non-serializable payload here rather than after a broker
    // adapter is swapped in.
    const payload = this.encodePayload(jobId, data);

    const job = createJob<TData>(
      {
        name: createJobName(jobName),
        queueName: this.name,
        data: payload,
        options: mergedOptions,
      },
      jobId,
    );
    this.jobs.set(jobId, job);
    this.emitter.emit("job:created", { job });

    if (mergedOptions.deduplicationKey) {
      this.deduplicationIndex.set(mergedOptions.deduplicationKey, jobId);
    }
    if (job.state === JobStateEnum.SCHEDULED && job.scheduledAt) {
      scheduleJob(job, this.scheduledTimers, this.jobs);
    }

    this.backoffMs = 50;
    this.emptySince = 0;

    return job;
  }

  process(name: string, processor: Processor<TData>): void {
    if (this.disposed) throw new QueueDisposedError(this.name);
    this.processors.set(name, processor);
    if (!this.pollTimer) this.startPolling();
  }

  async getJob(jobId: JobId): Promise<Job<TData> | null> {
    return this.jobs.get(jobId) ?? null;
  }

  /**
   * Returns the job that would be processed next without claiming it.
   *
   * This is a read-only peek. Consumers that intend to run the job must
   * use {@link claimNextJob}, which transitions it to `active` so no
   * other consumer can pick up the same job.
   */
  async getNextJob(): Promise<Job<TData> | null> {
    if (this.paused || this.disposed) return null;
    return this.selectJob();
  }

  /**
   * Atomically selects the next runnable job and marks it `active`.
   *
   * Claiming is what prevents two consumers — or one consumer polling in
   * a loop — from processing the same job repeatedly.
   */
  async claimNextJob(): Promise<Job<TData> | null> {
    if (this.paused || this.disposed) return null;

    const job = this.selectJob((candidate) =>
      this.processors.has(candidate.name),
    );

    if (!job) return null;

    const claimed = updateJobState(job, JobStateEnum.ACTIVE, {
      startedAt: new Date().toISOString() as never,
    });
    this.jobs.set(claimed.id, claimed);

    return claimed;
  }

  /**
   * Returns a claimed job to the waiting pool.
   */
  async releaseJob(jobId: JobId): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.state !== JobStateEnum.ACTIVE) {
      return false;
    }

    this.jobs.set(
      jobId,
      updateJobState(job, JobStateEnum.WAITING, { startedAt: undefined }),
    );
    return true;
  }

  getProcessor(name: string): Processor<TData> | undefined {
    return this.processors.get(name);
  }

  async getStats(): Promise<QueueStats> {
    let waiting = 0;
    let active = 0;
    let completed = 0;
    let failed = 0;
    let delayed = 0;
    let retrying = 0;

    for (const job of this.jobs.values()) {
      switch (job.state) {
        case JobStateEnum.WAITING:
          waiting++;
          break;
        case JobStateEnum.ACTIVE:
          active++;
          break;
        case JobStateEnum.COMPLETED:
          completed++;
          break;
        case JobStateEnum.FAILED:
        case JobStateEnum.DEAD_LETTER:
          failed++;
          break;
        case JobStateEnum.SCHEDULED:
          delayed++;
          break;
        case JobStateEnum.RETRYING:
          retrying++;
          break;
        default:
          break;
      }
    }

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      retrying,
      processed: this.counters.processedCount,
      succeeded: this.counters.succeededCount,
      errored: this.counters.failedCount,
      retried: this.counters.retriedCount,
      deadLettered: this.counters.deadLetteredCount,
    };
  }

  /**
   * Returns the jobs that exhausted their attempts.
   */
  async getDeadLetterJobs(): Promise<readonly DeadLetterJob<TData>[]> {
    return this.deadLetterStore.getAll();
  }

  async pause(): Promise<void> {
    this.paused = true;
  }
  async resume(): Promise<void> {
    if (this.disposed) throw new QueueDisposedError(this.name);
    this.paused = false;
    this.backoffMs = 50;
    this.emptySince = 0;
    if (!this.pollTimer && this.processors.size > 0) this.startPolling();
  }
  isPaused(): boolean {
    return this.paused;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Closes the queue, draining in-flight jobs first.
   *
   * Nothing is torn down until running jobs have settled, so a job can
   * never write back into a cleared queue. Jobs that outlast
   * `closeTimeout` have their `AbortSignal` aborted and are then
   * abandoned so shutdown cannot hang indefinitely.
   */
  async close(): Promise<void> {
    if (this.disposed) return;

    // Stop accepting and dispatching work before draining, so the set of
    // in-flight jobs cannot grow while we wait for it.
    this.disposed = true;
    this.stopPolling();

    for (const timer of this.scheduledTimers.values()) clearTimeout(timer);
    this.scheduledTimers.clear();
    for (const timer of this.retryTimers.values()) clearTimeout(timer);
    this.retryTimers.clear();

    await this.drain(this.options.closeTimeout ?? DEFAULT_CLOSE_TIMEOUT_MS);

    this.jobs.clear();
    this.processors.clear();
    this.deduplicationIndex.clear();
    this.settledOrder.length = 0;
    this.stalledCounts.clear();
    this.inFlight.clear();
    this.activeCount = 0;
    this.paused = false;
    this.emptySince = 0;
    this.backoffMs = 50;
  }

  /**
   * Waits for in-flight jobs to settle, aborting them past the timeout.
   */
  private async drain(timeoutMs: number): Promise<void> {
    if (this.activeCount === 0) return;

    const deadline = Date.now() + Math.max(0, timeoutMs);

    while (this.activeCount > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    if (this.activeCount === 0) return;

    for (const controller of this.inFlight.values()) {
      if (!controller.signal.aborted) {
        controller.abort(new QueueDisposedError(this.name));
      }
    }

    // Give aborted processors a brief window to unwind before returning.
    const abortDeadline = Date.now() + 1_000;
    while (this.activeCount > 0 && Date.now() < abortDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Generates a collision-resistant job id.
   */
  private createJobId(): JobId {
    return `job_${Date.now()}_${randomUUID().replace(/-/g, "")}` as JobId;
  }

  /**
   * Round-trips a payload through the configured serializer.
   */
  private encodePayload(jobId: JobId, data: TData): TData {
    if (this.options.serializePayloads === false) {
      return data;
    }

    try {
      return this.serializer.deserialize<TData>(
        this.serializer.serialize(data),
      );
    } catch (error) {
      throw new JobSerializationError(
        jobId,
        `Job payload for queue "${this.name}" is not serializable.`,
        { queueName: this.name, cause: error },
      );
    }
  }

  /**
   * Selects the highest-priority job that is due and runnable.
   *
   * Ties on priority are broken by creation time, oldest first. The
   * incumbent is tracked by reference rather than by a sentinel priority,
   * so jobs with negative priorities are selectable like any other.
   */
  private selectJob(
    predicate?: (job: Job<TData>) => boolean,
  ): Job<TData> | null {
    const now = Date.now();
    let nextJob: Job<TData> | null = null;

    for (const job of this.jobs.values()) {
      if (job.state !== JobStateEnum.WAITING) continue;
      if (job.scheduledAt && new Date(job.scheduledAt).getTime() > now)
        continue;
      if (predicate && !predicate(job)) continue;

      if (nextJob === null) {
        nextJob = job;
        continue;
      }

      if (job.priority > nextJob.priority) {
        nextJob = job;
        continue;
      }

      if (job.priority === nextJob.priority) {
        const candidateTime = new Date(job.createdAt).getTime();
        const incumbentTime = new Date(nextJob.createdAt).getTime();
        if (candidateTime < incumbentTime) nextJob = job;
      }
    }

    return nextJob;
  }

  private startPolling(): void {
    this.scheduleTick(this.options.pollInterval ?? 50);
  }

  private scheduleNextTick(): void {
    this.scheduleTick(this.backoffMs);
  }

  private scheduleTick(interval: number): void {
    if (this.disposed) return;

    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      this.processTick().finally(() => {
        if (!this.disposed && this.processors.size > 0) this.scheduleNextTick();
      });
    }, interval);

    // The poll timer must not be the reason a process stays alive.
    this.pollTimer.unref?.();
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Runs an already-claimed job through this queue's processing pipeline.
   *
   * The queue owns job state, so every consumer — the internal poller and
   * any external `Worker` — must run jobs through here. A consumer that
   * invokes a processor directly leaves the job stuck in `active` and
   * skips retry, dead-lettering and middleware entirely.
   */
  async runJob(
    job: Job<TData>,
    options?: {
      middleware?: readonly QueueMiddleware[];
      signal?: AbortSignal;
      /** Fallback timeout for a job that carries none of its own. */
      timeoutMs?: number;
    },
  ): Promise<void> {
    const processor = this.processors.get(job.name);

    if (!processor) {
      await this.releaseJob(job.id);
      return;
    }

    const abortController = new AbortController();

    // A consumer's own signal (a worker draining, say) must reach the
    // job it dispatched.
    if (options?.signal) {
      if (options.signal.aborted) {
        abortController.abort(options.signal.reason);
      } else {
        options.signal.addEventListener(
          "abort",
          () => {
            if (!abortController.signal.aborted) {
              abortController.abort(options.signal?.reason);
            }
          },
          { once: true },
        );
      }
    }

    this.inFlight.set(job.id, abortController);
    this.activeCount++;

    try {
      await processJob(
        job,
        processor,
        {
          timeoutMs: job.timeoutMs ?? options?.timeoutMs,
          abortController,
        },
        {
          jobs: this.jobs,
          emitter: this.emitter,
          deadLetterStore: this.deadLetterStore,
          counters: this.counters,
          middleware: options?.middleware
            ? [...this.middleware, ...options.middleware]
            : this.middleware,
          registerRetryTimer: (jobId, timer) => {
            this.retryTimers.set(jobId, timer);
          },
          onSettled: (settled) => this.recordSettled(settled),
          isDisposed: () => this.disposed,
        },
      );
    } catch (error) {
      this.emitter.emit("job:failed", {
        job,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    } finally {
      this.activeCount--;
      this.inFlight.delete(job.id);
      this.retryTimers.delete(job.id);
    }
  }

  private async processTick(): Promise<void> {
    if (this.paused || this.disposed) return;
    const concurrency = Math.max(1, this.options.concurrency ?? 1);

    let processed = 0;

    while (this.activeCount < concurrency) {
      // `claimNextJob` only returns jobs that have a registered
      // processor and moves them out of `waiting`, so this loop always
      // terminates. Returning an unrunnable job here is what previously
      // spun the event loop forever.
      const job = await this.claimNextJob();
      if (!job) break;

      processed++;

      // Not awaited: jobs run concurrently up to the limit. `runJob`
      // increments `activeCount` synchronously, so the loop condition
      // sees the dispatch immediately.
      void this.runJob(job);
    }

    if (processed > 0) {
      this.backoffMs = 50;
      this.emptySince = 0;
    } else if (this.emptySince === 0) {
      this.emptySince = Date.now();
      this.backoffMs = 50;
    } else {
      const elapsed = Date.now() - this.emptySince;
      if (elapsed > 500) {
        this.backoffMs = Math.min(this.backoffMs * 2, 2000);
      }
    }

    promoteDueScheduledJobs(this.jobs, this.scheduledTimers);
    this.reclaimStalledJobs();
  }

  /**
   * Returns jobs stuck in `active` to the waiting pool.
   *
   * A consumer can claim a job and then die, or be killed mid-run.
   * Without this the job stays `active` forever and no one picks it up
   * again. A job that stalls repeatedly is dead-lettered rather than
   * cycled indefinitely.
   */
  private reclaimStalledJobs(): void {
    const stalledAfter = this.options.stalledAfter ?? 0;

    if (stalledAfter <= 0) {
      return;
    }

    const now = Date.now();
    const maxStalled = Math.max(1, this.options.maxStalledCount ?? 3);

    for (const job of this.jobs.values()) {
      if (job.state !== JobStateEnum.ACTIVE || !job.startedAt) continue;

      // A job this queue is currently running is not stalled.
      if (this.inFlight.has(job.id)) continue;

      const startedAt = new Date(job.startedAt).getTime();
      if (Number.isNaN(startedAt) || now - startedAt < stalledAfter) continue;

      const count = (this.stalledCounts.get(job.id) ?? 0) + 1;
      this.stalledCounts.set(job.id, count);

      const error = new JobStalledError(job.id, { queueName: this.name });

      if (count >= maxStalled) {
        this.stalledCounts.delete(job.id);
        this.counters.failedCount++;
        this.counters.deadLetteredCount++;

        const deadLettered = updateJobState(job, JobStateEnum.DEAD_LETTER, {
          error: error.message,
          failedAt: new Date().toISOString() as never,
        });
        this.jobs.set(job.id, deadLettered);

        void this.deadLetterStore
          .add({
            job: deadLettered,
            deadLetterAt: new Date(),
            error,
            attempts: deadLettered.attempt,
            reason: `Stalled ${count} time(s).`,
          })
          .catch(() => {});

        this.emitter.emit("job:failed", { job: deadLettered, error });
        this.recordSettled(deadLettered);
        continue;
      }

      this.jobs.set(
        job.id,
        updateJobState(job, JobStateEnum.WAITING, { startedAt: undefined }),
      );
      this.emitter.emit("job:failed", { job, error });
    }
  }

  /**
   * Records a job that reached a terminal state and prunes history.
   *
   * Without this the queue retains every job it has ever run, and every
   * deduplication key it has ever seen, for the life of the process.
   */
  private recordSettled(job: Job<TData>): void {
    if (job.deduplicationKey) {
      const owner = this.deduplicationIndex.get(job.deduplicationKey);
      if (owner === job.id) {
        this.deduplicationIndex.delete(job.deduplicationKey);
      }
    }

    this.settledOrder.push(job.id);
    this.pruneSettled();
  }

  /**
   * Drops the oldest terminal jobs beyond the retention limit.
   */
  private pruneSettled(): void {
    const limit = Math.max(
      0,
      this.options.retainSettledJobs ?? DEFAULT_RETAINED_JOBS,
    );

    while (this.settledOrder.length > limit) {
      const jobId = this.settledOrder.shift();
      if (jobId === undefined) break;

      const job = this.jobs.get(jobId);
      if (job && TERMINAL_STATES.has(job.state)) {
        this.jobs.delete(jobId);
        this.stalledCounts.delete(jobId);
      }
    }
  }
}
