import type { ScheduleType } from "./types/schedulerTypes.core.js";

import type { JobDefinition } from "./job/jobDefinition.type.js";

import type { Schedule } from "./schedule/schedule.type.js";

import type { ScheduleOptions } from "./schedule/scheduleOptions.type.js";

import type { ScheduleHandle } from "./scheduleHandle/scheduleHandle.type.js";

import type { Trigger } from "./trigger/trigger.type.js";

import type { Clock } from "./clock/schedulerClock.type.js";

import { ScheduleHandleImpl } from "./scheduleHandle/scheduleHandle.type.js";

import {
  SchedulerAlreadyStartedError,
  SchedulerStoppedError,
  InvalidScheduleError,
  InvalidJobError,
} from "./errors/scheduler.errors.js";

import {
  DateTrigger,
  DelayTrigger,
  IntervalTrigger,
  CronTrigger,
} from "./trigger/schedulerTrigger.core.js";

import { SystemClock } from "./clock/schedulerClock.type.js";

import { JobRegistry } from "./registry/jobRegistry.core.js";

import { JobExecutor } from "./executor/jobExecutor.core.js";

import { PriorityQueue } from "./priorityQueue/schedulerPriorityQueue.core.js";

import { parseDuration } from "./duration/duration.parser.js";

import {
  MAX_SCHEDULES,
  MAX_TIMER_DELAY,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_MISFIRE_POLICY,
  DEFAULT_OVERLAP_POLICY,
} from "./constants/schedulerConstants.core.js";

/** Internal record for a live schedule. */
interface ScheduleRecord {
  schedule: Schedule;
  readonly trigger: Trigger;
  readonly options: ScheduleOptions;
  /** Controllers for executions currently in flight for this schedule. */
  readonly running: Set<AbortController>;
}

/** Details reported to an error listener when a job fails. */
export interface SchedulerErrorEvent {
  readonly scheduleId: string;
  readonly jobId: string;
  readonly executionId: string;
  readonly error: unknown;
}

/** Options accepted by {@link Scheduler}. */
export interface SchedulerOptions {
  readonly jobs?: JobRegistry;
  readonly executor?: JobExecutor;
  readonly queue?: PriorityQueue;
  readonly clock?: Clock;
  /** Maximum job executions in flight at once (default: 10). */
  readonly maxConcurrency?: number;
  /** Called when a job execution fails. */
  readonly onError?: (event: SchedulerErrorEvent) => void;
}

/**
 * Scheduler for time-based job execution.
 *
 * @example
 * ```ts
 * const scheduler = new Scheduler({ onError: (e) => log.error(e) });
 * scheduler.define({ id: "cleanup", name: "Cleanup", handler: run });
 * scheduler.every("5m", "cleanup");
 * scheduler.start();
 * // …later
 * await scheduler.stop();
 * ```
 */
export class Scheduler {
  private readonly jobs: JobRegistry;

  private readonly executor: JobExecutor;

  private readonly queue: PriorityQueue;

  private readonly clock: Clock;

  private readonly schedules = new Map<string, ScheduleRecord>();

  private readonly maxConcurrency: number;

  private readonly onError: ((event: SchedulerErrorEvent) => void) | undefined;

  /** Executions currently in flight, across all schedules. */
  private readonly inFlight = new Set<Promise<void>>();

  /**
   * Abort controllers for every in-flight execution.
   *
   * Tracked here as well as on the schedule record: a one-shot schedule is
   * retired as soon as it is dispatched, so by the time `stop()` runs its
   * record is already gone and a per-record set alone would have nothing left
   * to abort.
   */
  private readonly runningControllers = new Set<AbortController>();

  private running = false;

  private timer?: ReturnType<typeof setTimeout>;

  /**
   * @param options - Scheduler options, or a {@link JobRegistry} for the
   *   positional form kept for backwards compatibility.
   */
  constructor(
    options?: SchedulerOptions | JobRegistry,
    executor?: JobExecutor,
    queue?: PriorityQueue,
    clock?: Clock,
  ) {
    const opts: SchedulerOptions =
      options instanceof JobRegistry
        ? { jobs: options, executor, queue, clock }
        : (options ?? {});

    // Resolve the clock once and share it. Building a second SystemClock for
    // the executor meant a custom clock reached only one of the two.
    this.clock = opts.clock ?? new SystemClock();
    this.jobs = opts.jobs ?? new JobRegistry();
    this.executor = opts.executor ?? new JobExecutor(this.clock);
    this.queue = opts.queue ?? new PriorityQueue();
    this.maxConcurrency = opts.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    this.onError = opts.onError;
  }

  /** Whether the scheduler is currently running. */
  get isRunning(): boolean {
    return this.running;
  }

  /** Number of live schedules. */
  get scheduleCount(): number {
    return this.schedules.size;
  }

  /**
   * Starts the scheduler.
   */
  start(): void {
    if (this.running) {
      throw new SchedulerAlreadyStartedError();
    }

    this.running = true;
    this.tick();
  }

  /**
   * Stops the scheduler, aborting in-flight jobs and waiting for them to settle.
   *
   * @param options - `drain` waits for running jobs to finish instead of
   *   aborting them; `timeoutMs` bounds the wait either way.
   */
  async stop(options?: {
    readonly drain?: boolean;
    readonly timeoutMs?: number;
  }): Promise<void> {
    if (!this.running) {
      throw new SchedulerStoppedError();
    }

    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    if (options?.drain !== true) {
      // Abort every in-flight execution. Previously the AbortController was
      // created and immediately discarded, so nothing could ever be cancelled.
      for (const controller of this.runningControllers) {
        controller.abort(new Error("Scheduler stopped"));
      }
    }

    await this.settle(options?.timeoutMs);
  }

  /** Waits for in-flight executions to finish, up to an optional timeout. */
  private async settle(timeoutMs?: number): Promise<void> {
    if (this.inFlight.size === 0) return;

    const all = Promise.allSettled([...this.inFlight]).then(() => undefined);

    if (timeoutMs === undefined) {
      await all;
      return;
    }

    await Promise.race([
      all,
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, timeoutMs);
        if (timer.unref) timer.unref();
      }),
    ]);
  }

  /**
   * Defines a new job.
   */
  define(job: JobDefinition): void {
    if (typeof job?.id !== "string" || job.id.trim().length === 0) {
      throw new InvalidJobError(
        "Job definition requires a non-empty string id.",
        String(job?.id),
      );
    }
    if (typeof job.handler !== "function") {
      throw new InvalidJobError(
        `Job "${job.id}" requires a handler function.`,
        job.id,
      );
    }
    if (job.options?.timeout !== undefined && job.options.timeout <= 0) {
      throw new InvalidJobError(
        `Job "${job.id}" timeout must be positive, got ${job.options.timeout}.`,
        job.id,
      );
    }

    this.jobs.register(job);
  }

  /**
   * Schedules a job to run once after a delay.
   */
  after(
    delay: string,
    jobId: string,
    options?: ScheduleOptions,
  ): ScheduleHandle {
    const delayMs = parseDuration(delay);
    return this.scheduleJob(jobId, new DelayTrigger(delayMs), "delay", options);
  }

  /**
   * Schedules a job to run at a specific date.
   */
  at(date: Date, jobId: string, options?: ScheduleOptions): ScheduleHandle {
    return this.scheduleJob(jobId, new DateTrigger(date), "once", options);
  }

  /**
   * Schedules a job to run at a fixed interval.
   */
  every(
    interval: string,
    jobId: string,
    options?: ScheduleOptions,
  ): ScheduleHandle {
    const intervalMs = parseDuration(interval);
    return this.scheduleJob(
      jobId,
      new IntervalTrigger(intervalMs),
      "interval",
      options,
    );
  }

  /**
   * Schedules a job using a cron expression.
   */
  cron(
    expression: string,
    jobId: string,
    options?: ScheduleOptions & { readonly timezone?: string },
  ): ScheduleHandle {
    const trigger = new CronTrigger(expression, options?.timezone);
    return this.scheduleJob(jobId, trigger, "cron", options, expression);
  }

  /** Returns a snapshot of a schedule, or undefined. */
  getSchedule(scheduleId: string): Schedule | undefined {
    return this.schedules.get(scheduleId)?.schedule;
  }

  /** Returns snapshots of every live schedule. */
  listSchedules(): readonly Schedule[] {
    return [...this.schedules.values()].map((record) => record.schedule);
  }

  /**
   * Schedules a job with a trigger.
   */
  private scheduleJob(
    jobId: string,
    trigger: Trigger,
    type: ScheduleType,
    options?: ScheduleOptions,
    expression?: string,
  ): ScheduleHandle {
    if (!this.jobs.has(jobId)) {
      throw new InvalidJobError(`Job "${jobId}" is not registered.`, jobId);
    }

    if (this.schedules.size >= MAX_SCHEDULES) {
      throw new InvalidScheduleError(
        `Maximum number of schedules (${MAX_SCHEDULES}) exceeded.`,
        jobId,
      );
    }

    const scheduleId = crypto.randomUUID();
    const now = this.clock.now();
    let nextRunAt = trigger.next(now);

    if (nextRunAt === null) {
      // The fire time has already passed. That is the misfire case, not an
      // error — `at(pastDate)` and a schedule restored after a restart both
      // land here.
      const misfire = options?.misfire ?? DEFAULT_MISFIRE_POLICY;

      if (misfire === "skip") {
        throw new InvalidScheduleError(
          "Trigger has no future fire time and the misfire policy is 'skip'.",
          scheduleId,
        );
      }
      // "run-once" and "catch-up" both start by running immediately.
      nextRunAt = now;
    }

    if (Number.isNaN(nextRunAt.getTime())) {
      throw new InvalidScheduleError(
        "Trigger produced an invalid date.",
        scheduleId,
      );
    }

    const schedule: Schedule = {
      id: scheduleId,
      jobId,
      type,
      expression,
      nextRunAt,
      state: "active",
      options,
    };

    const record: ScheduleRecord = {
      schedule,
      trigger,
      options: options ?? {},
      running: new Set(),
    };

    this.schedules.set(scheduleId, record);
    this.queue.enqueue(schedule);

    // The handle holds a reference to this scheduler, so pause, resume and
    // cancel actually reach the queue instead of mutating a detached copy.
    return new ScheduleHandleImpl(scheduleId, "active", {
      setState: (state) => this.setScheduleState(scheduleId, state),
      getState: () => this.schedules.get(scheduleId)?.schedule.state,
      getNextRun: () => this.schedules.get(scheduleId)?.schedule.nextRunAt,
      abortRunning: () => this.abortSchedule(scheduleId),
    });
  }

  /** Applies a state change to a live schedule. */
  private setScheduleState(scheduleId: string, state: Schedule["state"]): void {
    const record = this.schedules.get(scheduleId);
    if (!record) return;

    record.schedule = { ...record.schedule, state };

    if (state === "cancelled" || state === "completed") {
      this.queue.remove(scheduleId);
      this.schedules.delete(scheduleId);
    } else if (state === "paused") {
      this.queue.remove(scheduleId);
    } else if (state === "active") {
      // Resuming: recompute from now so a schedule paused across its fire time
      // does not immediately fire for every occurrence it missed.
      const next = record.trigger.next(this.clock.now());
      if (next && !Number.isNaN(next.getTime())) {
        record.schedule = { ...record.schedule, nextRunAt: next };
        this.queue.remove(scheduleId);
        this.queue.enqueue(record.schedule);
        this.rearm();
      }
    }
  }

  /** Aborts every in-flight execution of one schedule. */
  private abortSchedule(scheduleId: string): void {
    const record = this.schedules.get(scheduleId);
    if (!record) return;
    for (const controller of record.running) {
      controller.abort(new Error("Schedule cancelled"));
    }
  }

  /**
   * Internal tick method for processing due jobs.
   */
  private tick(): void {
    if (!this.running) {
      return;
    }

    const now = this.clock.now();

    while (!this.queue.isEmpty) {
      const schedule = this.queue.peek();

      if (!schedule || schedule.nextRunAt > now) {
        break;
      }

      this.queue.dequeue();

      const record = this.schedules.get(schedule.id);
      if (!record || record.schedule.state !== "active") {
        continue;
      }

      // Concurrency ceiling: without one, N due schedules start N executions
      // at once. Anything over the ceiling is left for the next tick.
      if (this.inFlight.size >= this.maxConcurrency) {
        this.queue.enqueue(record.schedule);
        break;
      }

      this.dispatch(record);
      this.reschedule(record);
    }

    this.rearm();
  }

  /** (Re)arms the tick timer for the next due schedule. */
  private rearm(): void {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);

    const delay = this.calculateDelay();
    this.timer = setTimeout(() => this.tick(), delay);
    if (this.timer.unref) this.timer.unref();
  }

  /**
   * Computes the next fire time and puts the schedule back on the queue.
   *
   * Nothing did this before, so `every()` and `cron()` fired exactly once and
   * then sat in the map forever.
   */
  private reschedule(record: ScheduleRecord): void {
    const isRecurring =
      record.schedule.type === "interval" || record.schedule.type === "cron";

    if (!isRecurring) {
      // One-shot: retire it rather than leaking the entry.
      record.schedule = {
        ...record.schedule,
        state: "completed",
        lastRunAt: this.clock.now(),
      };
      this.schedules.delete(record.schedule.id);
      return;
    }

    const from = this.clock.now();
    const next = record.trigger.next(from);

    if (!next || Number.isNaN(next.getTime())) {
      // A trigger with no further fire time is finished.
      record.schedule = { ...record.schedule, state: "completed" };
      this.schedules.delete(record.schedule.id);
      return;
    }

    record.schedule = {
      ...record.schedule,
      nextRunAt: next,
      lastRunAt: from,
    };
    this.queue.enqueue(record.schedule);
  }

  /** Starts one execution of a schedule and tracks it. */
  private dispatch(record: ScheduleRecord): void {
    const job = this.jobs.get(record.schedule.jobId);
    if (!job) return;

    const overlap = record.options.overlap ?? DEFAULT_OVERLAP_POLICY;
    if (overlap === "skip" && record.running.size > 0) {
      return;
    }
    if (overlap === "replace" && record.running.size > 0) {
      for (const controller of record.running) {
        controller.abort(new Error("Superseded by a newer execution"));
      }
    }

    const executionId = crypto.randomUUID();
    const controller = new AbortController();
    record.running.add(controller);
    this.runningControllers.add(controller);

    const scheduleId = record.schedule.id;
    const scheduledAt = record.schedule.nextRunAt;

    const execution = this.executor
      .execute(
        job,
        executionId,
        scheduledAt,
        1,
        controller.signal,
        record.options.data,
      )
      .then(() => undefined)
      .catch((error: unknown) => {
        // A failure used to vanish into an empty catch block with a "retry
        // logic would go here" comment. Retries now live in the executor, and
        // whatever survives them is reported.
        this.reportError({
          scheduleId,
          jobId: job.id,
          executionId,
          error,
        });
      })
      .finally(() => {
        record.running.delete(controller);
        this.runningControllers.delete(controller);
        this.inFlight.delete(execution);
      });

    this.inFlight.add(execution);
  }

  /** Hands an execution failure to the error listener. */
  private reportError(event: SchedulerErrorEvent): void {
    if (!this.onError) return;
    try {
      this.onError(event);
    } catch {
      // A throwing error listener must not take the scheduler down with it.
    }
  }

  /**
   * Calculates the delay until the next tick.
   */
  private calculateDelay(): number {
    if (this.queue.isEmpty) {
      return MAX_TIMER_DELAY;
    }

    const next = this.queue.peek();
    if (!next) {
      return MAX_TIMER_DELAY;
    }

    const delay = next.nextRunAt.getTime() - this.clock.nowMs();
    return Math.max(0, Math.min(delay, MAX_TIMER_DELAY));
  }
}
