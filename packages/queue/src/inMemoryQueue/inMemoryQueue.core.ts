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
import { assertProcessor } from "../processor/processor.type.js";
import type { JobOptions } from "../jobOptions/jobOptions.type.js";
import type { Serializer } from "../serializer/serializer.type.js";
import type { QueueMiddleware } from "../middleware/middleware.type.js";

import { createJob, updateJobState } from "../job/job.core.js";
import {
  JobState as JobStateEnum,
  createJobName,
} from "../jobTypes/jobTypes.type.js";
import { JsonSerializer } from "../serializer/serializer.core.js";
import {
  DEFAULT_DEAD_LETTER_JOBS,
  createInMemoryDeadLetterStore,
} from "../deadLetter/deadLetter.core.js";
import { InMemoryQueueEventEmitter } from "../queueEmitter/queueEmitter.core.js";
import type { QueueEventEmitter } from "../queueEmitter/queueEmitter.type.js";
import type {
  DeadLetterJob,
  DeadLetterStore,
} from "../deadLetter/deadLetter.type.js";

import { processJob } from "./inMemoryQueue.processing.js";
import { captureContext } from "../contextCarrier/contextCarrier.core.js";
import type { QueueCounters } from "./inMemoryQueue.processing.js";
import {
  scheduleJob,
  promoteDueScheduledJobs,
} from "./inMemoryQueue.scheduling.js";
import { QueuePoller, hasPendingWork, selectNextJob } from "./polling/index.js";

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
  /** Whether the internal poller claims jobs; see `setAutoProcess`. */
  private autoProcess: boolean;
  private activeCount = 0;
  private readonly poller: QueuePoller;
  /** Consumers to tell when a job may have become runnable. */
  private readonly readyListeners: Set<() => void> = new Set();
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
  /**
   * Whether this queue created its own dead letter store. A store handed in
   * by the caller outlives the queue and is theirs to clear.
   */
  private readonly ownsDeadLetterStore: boolean;
  private readonly emitter: QueueEventEmitter;

  private readonly counters: QueueCounters = {
    processedCount: 0,
    succeededCount: 0,
    failedCount: 0,
    retriedCount: 0,
    deadLetteredCount: 0,
  };

  constructor(name: QueueName, options?: QueueOptions) {
    this.name = name;
    this.options = options ?? {};
    this.serializer = this.options.serializer ?? JsonSerializer;
    this.middleware = this.options.middleware ?? [];
    // A working emitter by default: `queue.events` used to be a silent no-op
    // unless one was passed in.
    this.emitter =
      options?.eventEmitter ??
      new InMemoryQueueEventEmitter(
        this.options.logger ? { logger: this.options.logger } : {},
      );

    // A supplied emitter is built before the queue exists, so it cannot have
    // been given the queue's logger. Hand it over, so a throwing listener is
    // reported through structured logging rather than `process.emitWarning`.
    if (
      this.options.logger &&
      this.emitter instanceof InMemoryQueueEventEmitter
    ) {
      this.emitter.setLogger(this.options.logger);
    }

    this.ownsDeadLetterStore = this.options.deadLetterStore === undefined;
    // A caller's store is typed `DeadLetterStore<unknown>` (see
    // `QueueOptions.deadLetterStore`); this queue only ever adds its own
    // `TData` jobs to it, so it is read back as a store of `TData`.
    this.deadLetterStore =
      (this.options.deadLetterStore as DeadLetterStore<TData> | undefined) ??
      createInMemoryDeadLetterStore<TData>({
        maxEntries: DEFAULT_DEAD_LETTER_JOBS,
      });
    this.autoProcess = this.options.autoProcess ?? true;
    this.poller = new QueuePoller({
      ...(this.options.pollInterval !== undefined
        ? { pollInterval: this.options.pollInterval }
        : {}),
      tick: () => this.processTick(),
      isLive: () => !this.disposed && this.processors.size > 0,
      shouldKeepAlive: () => this.shouldKeepAlive(),
    });
  }

  /**
   * Subscribes to "a job may have become runnable": one was added, released
   * or reclaimed, a delay or retry backoff elapsed, or the queue resumed.
   *
   * A `Worker` uses this to claim immediately instead of on its next poll.
   *
   * @returns A function that unsubscribes.
   */
  onJobReady(listener: () => void): () => void {
    this.readyListeners.add(listener);
    return () => {
      this.readyListeners.delete(listener);
    };
  }

  /**
   * Turns the internal poller on or off as a consumer.
   *
   * While off, the poller still promotes scheduled jobs and reclaims stalled
   * ones, but claims nothing: an external `Worker` is the only consumer, so
   * stopping it really stops consumption and its middleware, timeout and
   * concurrency apply to every job.
   */
  setAutoProcess(enabled: boolean): void {
    this.autoProcess = enabled;
    if (enabled) this.poller.wake();
  }

  /**
   * The emitter this queue publishes lifecycle events on.
   *
   * An in-memory emitter when the queue was created without one, so
   * `queue.events.on(...)` works out of the box and a worker can report its
   * lifecycle unconditionally.
   */
  get events(): QueueEventEmitter {
    return this.emitter;
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

    const merged = { ...this.options.defaultJobOptions, ...options };
    const metadata = captureContext(
      this.options.contextCarriers,
      merged.metadata,
    );
    const mergedOptions =
      metadata === merged.metadata ? merged : { ...merged, metadata };

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
      scheduleJob(job, this.scheduledTimers, this.jobs, () => this.jobReady());
    }

    // Wake the poller and any worker now. Resetting the back-off without
    // re-arming the pending timer left a job added after an idle spell
    // waiting up to 2 s; a delayed job wakes it too, so the pending work
    // holds the process open.
    this.jobReady();

    return job;
  }

  process(name: string, processor: Processor<TData>): void {
    if (this.disposed) throw new QueueDisposedError(this.name);
    assertProcessor(processor, name);
    this.processors.set(name, processor);
    // Jobs already waiting under this name are runnable now.
    this.poller.wake();
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
    this.jobReady();
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
    this.jobReady();
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
    this.poller.stop();
    this.readyListeners.clear();

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

    // A dead letter store the queue created dies with it; one handed in by
    // the caller is theirs and is left alone.
    if (this.ownsDeadLetterStore) {
      await this.deadLetterStore.clear();
    }

    this.activeCount = 0;
    this.paused = false;
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
    // A passthrough serializer means "store the payload as given": there is
    // no string form to round-trip through.
    if (
      this.options.serializePayloads === false ||
      this.serializer.passthrough === true
    ) {
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
   * Selects the next job that is due and runnable; see {@link selectNextJob}
   * for the ordering.
   */
  private selectJob(
    predicate?: (job: Job<TData>) => boolean,
  ): Job<TData> | null {
    return selectNextJob(this.jobs.values(), Date.now(), predicate);
  }

  /**
   * Whether the poll loop should hold the process open: while the queue is
   * consuming and has work one of its processors can run. Work nothing can
   * consume, a paused queue and `keepAlive: false` never do.
   */
  private shouldKeepAlive(): boolean {
    if (this.options.keepAlive === false) return false;
    if (this.disposed || this.paused || !this.autoProcess) return false;
    if (this.activeCount > 0) return true;
    return hasPendingWork(this.jobs.values(), (job) =>
      this.processors.has(job.name),
    );
  }

  /** Wakes the poll loop and tells consumers a job may be runnable. */
  private jobReady(): void {
    this.poller.wake();
    for (const listener of [...this.readyListeners]) {
      try {
        listener();
      } catch {
        // A consumer's wake-up hook must not break the producer.
      }
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
    // job it dispatched. The forwarder is held so it can be removed once
    // the job settles: a worker uses one long-lived signal for every job
    // it dispatches, so a listener left behind accumulates for the life
    // of the worker and pins that job's controller with it.
    const consumerSignal = options?.signal;
    let forwardAbort: (() => void) | undefined;

    if (consumerSignal) {
      if (consumerSignal.aborted) {
        abortController.abort(consumerSignal.reason);
      } else {
        forwardAbort = (): void => {
          if (!abortController.signal.aborted) {
            abortController.abort(consumerSignal.reason);
          }
        };
        consumerSignal.addEventListener("abort", forwardAbort, { once: true });
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
          ...(this.options.timeoutGraceMs !== undefined
            ? { timeoutGraceMs: this.options.timeoutGraceMs }
            : {}),
          ...(this.options.contextCarriers
            ? { contextCarriers: this.options.contextCarriers }
            : {}),
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
          deregisterRetryTimer: (jobId) => {
            this.retryTimers.delete(jobId);
          },
          onSettled: (settled) => this.recordSettled(settled),
          onJobReady: () => this.jobReady(),
          isDisposed: () => this.disposed,
          ...(this.options.logger ? { logger: this.options.logger } : {}),
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
      // A slot is free: claim the next job now rather than on the next poll.
      this.poller.wake();
      if (forwardAbort && consumerSignal) {
        consumerSignal.removeEventListener("abort", forwardAbort);
      }
    }
  }

  /**
   * One poll: promotes due delayed jobs, claims runnable jobs up to the
   * concurrency limit, and reclaims stalled ones.
   *
   * @returns Whether any job was dispatched.
   */
  private async processTick(): Promise<boolean> {
    if (this.paused || this.disposed) return false;
    const concurrency = Math.max(1, this.options.concurrency ?? 1);

    // Promote first, so a job whose delay just elapsed is claimable in this
    // same tick.
    promoteDueScheduledJobs(this.jobs, this.scheduledTimers);

    let processed = 0;

    while (this.autoProcess && this.activeCount < concurrency) {
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

    this.reclaimStalledJobs();
    return processed > 0;
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
      this.jobReady();
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
