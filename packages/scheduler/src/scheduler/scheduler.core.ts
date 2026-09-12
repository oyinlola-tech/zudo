import type {
  JobExecution,
  JobState,
  ScheduleType,
} from "./types/schedulerTypes.core.js";

import type { JobDefinition } from "./job/jobDefinition.type.js";

import type { Schedule } from "./schedule/schedule.type.js";

import type { ScheduleOptions } from "./schedule/scheduleOptions.type.js";

import type { ScheduleHandle } from "./scheduleHandle/scheduleHandle.type.js";

import type { Trigger } from "./trigger/trigger.type.js";

import type { Clock } from "./clock/schedulerClock.type.js";

import { ScheduleHandleImpl } from "./scheduleHandle/scheduleHandle.type.js";

import { createSchedule } from "./schedule/schedule.type.js";

import {
  SchedulerAlreadyStartedError,
  SchedulerStoppedError,
  SchedulerJobCancelledError,
  SchedulerJobTimeoutError,
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
  MAX_EXECUTION_HISTORY,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_MISFIRE_POLICY,
  DEFAULT_OVERLAP_POLICY,
} from "./constants/schedulerConstants.core.js";

/**
 * Ceiling on fire times held back by `overlap: "queue"` or a job concurrency
 * limit. Without one, a schedule whose job never keeps up would grow an
 * unbounded backlog of runs nobody wants any more.
 */
const MAX_PENDING_RUNS = 1024;

/** Internal record for a live schedule. */
interface ScheduleRecord {
  schedule: Schedule;
  readonly trigger: Trigger;
  readonly options: ScheduleOptions;
  /** Controllers for executions currently in flight for this schedule. */
  readonly running: Set<AbortController>;
  /**
   * Fire times held back by `overlap: "queue"` or a job concurrency ceiling,
   * to be dispatched as executions finish.
   */
  pendingRuns: number;
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

  /** Executions in flight per job id, for the per-job concurrency ceiling. */
  private readonly runningByJob = new Map<string, number>();

  /** Records with `pendingRuns > 0`, drained as executions finish. */
  private readonly pending = new Set<ScheduleRecord>();

  /** Bounded ring of execution records, newest last. */
  private readonly executionHistory: JobExecution[] = [];

  /**
   * Final state of schedules that have been retired, so a handle to a
   * one-shot that already fired reports "completed" instead of the "active"
   * it was created with. Bounded to {@link MAX_SCHEDULES} entries.
   */
  private readonly retiredStates = new Map<string, Schedule["state"]>();

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
      // Runs held back by overlap or a concurrency ceiling are discarded with
      // them; keeping them would fire on a later start for a time long past.
      for (const record of this.pending) record.pendingRuns = 0;
      this.pending.clear();
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
    if (
      job.options?.timeout !== undefined &&
      (!Number.isFinite(job.options.timeout) ||
        job.options.timeout <= 0 ||
        job.options.timeout > MAX_TIMER_DELAY)
    ) {
      // `Infinity` and anything past the 32-bit timer ceiling are clamped
      // by Node to 1ms, so a job declared with "no timeout" was failing on
      // its first millisecond.
      throw new InvalidJobError(
        `Job "${job.id}" timeout must be a positive number no greater than ${MAX_TIMER_DELAY}ms, got ${job.options.timeout}.`,
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

    const schedule = createSchedule(
      scheduleId,
      jobId,
      type,
      nextRunAt,
      options ?? {},
      expression,
    );

    const record: ScheduleRecord = {
      schedule,
      trigger,
      options: options ?? {},
      running: new Set(),
      pendingRuns: 0,
    };

    this.schedules.set(scheduleId, record);
    this.queue.enqueue(schedule);

    // The handle holds a reference to this scheduler, so pause, resume and
    // cancel actually reach the queue instead of mutating a detached copy.
    return new ScheduleHandleImpl(scheduleId, "active", {
      setState: (state) => this.setScheduleState(scheduleId, state),
      getState: () =>
        this.schedules.get(scheduleId)?.schedule.state ??
        this.retiredStates.get(scheduleId),
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
      // Held-back runs belong to a schedule that no longer exists.
      this.retire(record, state, { dropPending: true });
    } else if (state === "paused") {
      this.queue.remove(scheduleId);
    } else if (state === "active") {
      // Resuming: recompute from now so a schedule paused across its fire time
      // does not immediately fire for every occurrence it missed.
      const now = this.clock.now();
      let next = record.trigger.next(now);

      if (next === null) {
        // The fire time passed while paused. A one-shot used to stay "active"
        // here with nothing ever able to dispatch it; apply the misfire
        // policy exactly as `scheduleJob` does for a fire time already past.
        const misfire = record.options.misfire ?? DEFAULT_MISFIRE_POLICY;
        const isRecurring =
          record.schedule.type === "interval" ||
          record.schedule.type === "cron";

        if (misfire === "skip" || isRecurring) {
          // Nothing left to fire: retire it rather than leaking an entry.
          this.retire(record, "completed", { dropPending: true });
          return;
        }
        next = now;
      }

      if (Number.isNaN(next.getTime())) return;

      record.schedule = { ...record.schedule, nextRunAt: next };
      this.queue.remove(scheduleId);
      this.queue.enqueue(record.schedule);
      this.rearm();
    }
  }

  /**
   * Drops a schedule that will never fire again, remembering why.
   *
   * Runs already held back by `overlap: "queue"` or a concurrency ceiling
   * are kept by default: they are fire times that have arrived, and a
   * one-shot retired at dispatch still owes them. Only a cancel, or a
   * misfire policy that says skip, discards them.
   */
  private retire(
    record: ScheduleRecord,
    state: "completed" | "cancelled",
    options?: { readonly dropPending?: boolean },
  ): void {
    record.schedule = { ...record.schedule, state };
    if (options?.dropPending === true) {
      record.pendingRuns = 0;
      this.pending.delete(record);
    }
    this.queue.remove(record.schedule.id);
    this.schedules.delete(record.schedule.id);

    this.retiredStates.set(record.schedule.id, state);
    while (this.retiredStates.size > MAX_SCHEDULES) {
      const oldest = this.retiredStates.keys().next().value;
      if (oldest === undefined) break;
      this.retiredStates.delete(oldest);
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
      record.schedule = { ...record.schedule, lastRunAt: this.clock.now() };
      this.retire(record, "completed");
      return;
    }

    // "catch-up" advances from the fire time that just ran, so a schedule
    // that fell behind replays each missed occurrence instead of silently
    // skipping to the next future one. Every other policy resumes from now.
    const misfire = record.options.misfire ?? DEFAULT_MISFIRE_POLICY;
    const now = this.clock.now();
    const from =
      misfire === "catch-up" ? record.schedule.nextRunAt : now;
    const next = record.trigger.next(from);

    if (!next || Number.isNaN(next.getTime())) {
      // A trigger with no further fire time is finished.
      this.retire(record, "completed");
      return;
    }

    record.schedule = {
      ...record.schedule,
      nextRunAt: next,
      lastRunAt: now,
    };
    this.queue.enqueue(record.schedule);
  }

  /** Starts one execution of a schedule and tracks it. */
  private dispatch(record: ScheduleRecord): void {
    const job = this.jobs.get(record.schedule.jobId);
    if (!job) return;

    // A schedule cancelled or paused while a run was held back must not fire.
    if (
      record.schedule.state === "cancelled" ||
      record.schedule.state === "paused"
    ) {
      return;
    }

    // A schedule's own policy wins over the job's default.
    const overlap =
      record.options.overlap ?? job.options?.overlap ?? DEFAULT_OVERLAP_POLICY;

    if (record.running.size > 0) {
      if (overlap === "skip") return;
      if (overlap === "queue") {
        // Hold the fire time rather than dropping it; it is dispatched when
        // the running execution finishes. "queue" used to fall through to
        // "allow" and start a concurrent run.
        this.defer(record);
        return;
      }
      if (overlap === "replace") {
        for (const controller of record.running) {
          controller.abort(new Error("Superseded by a newer execution"));
        }
      }
    }

    // Per-job concurrency ceiling. `JobOptions.concurrency` was accepted and
    // read by nothing, so a job declaring `concurrency: 1` still ran as many
    // executions at once as it had due schedules.
    const concurrency = job.options?.concurrency;
    if (
      concurrency !== undefined &&
      (this.runningByJob.get(job.id) ?? 0) >= Math.max(1, concurrency)
    ) {
      this.defer(record);
      return;
    }

    const executionId = crypto.randomUUID();
    const controller = new AbortController();
    record.running.add(controller);
    this.runningControllers.add(controller);
    this.runningByJob.set(job.id, (this.runningByJob.get(job.id) ?? 0) + 1);

    const scheduleId = record.schedule.id;
    const scheduledAt = record.schedule.nextRunAt;
    const startedAt = this.clock.now();

    this.beginExecution({
      id: executionId,
      jobId: job.id,
      scheduleId,
      status: "running",
      scheduledAt,
      startedAt,
      attempt: 1,
    });

    const execution = this.executor
      .execute(
        job,
        executionId,
        scheduledAt,
        1,
        controller.signal,
        record.options.data,
      )
      .then(() => {
        this.finishExecution(executionId, "completed", startedAt);
      })
      .catch((error: unknown) => {
        this.finishExecution(executionId, statusFor(error), startedAt, error);
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

        const remaining = (this.runningByJob.get(job.id) ?? 1) - 1;
        if (remaining <= 0) this.runningByJob.delete(job.id);
        else this.runningByJob.set(job.id, remaining);

        this.drainPending();
        // Capacity freed: a schedule held back by the ceiling is waiting for
        // exactly this moment, and no timer is armed for it.
        this.rearm();
      });

    this.inFlight.add(execution);
  }

  /** Holds a fire time back until capacity frees up. */
  private defer(record: ScheduleRecord): void {
    if (record.pendingRuns >= MAX_PENDING_RUNS) return;
    record.pendingRuns += 1;
    this.pending.add(record);
  }

  /**
   * Dispatches held-back runs that can now proceed.
   *
   * A record that is still blocked re-defers itself, which shows up as its
   * counter returning to where it started; that is the loop's exit condition,
   * so a blocked record cannot spin.
   */
  private drainPending(): void {
    if (!this.running || this.pending.size === 0) return;

    for (const record of [...this.pending]) {
      while (record.pendingRuns > 0) {
        if (this.inFlight.size >= this.maxConcurrency) return;

        const before = record.pendingRuns;
        record.pendingRuns -= 1;
        this.dispatch(record);
        if (record.pendingRuns >= before) break;
      }

      if (record.pendingRuns === 0) this.pending.delete(record);
    }
  }

  /** Records a started execution, evicting the oldest beyond the cap. */
  private beginExecution(execution: JobExecution): void {
    this.executionHistory.push(execution);
    while (this.executionHistory.length > MAX_EXECUTION_HISTORY) {
      this.executionHistory.shift();
    }
  }

  /** Completes the record for an execution, if it is still in the history. */
  private finishExecution(
    executionId: string,
    status: JobState,
    startedAt: Date,
    error?: unknown,
  ): void {
    const index = this.executionHistory.findIndex(
      (entry) => entry.id === executionId,
    );
    if (index === -1) return;

    const completedAt = this.clock.now();
    this.executionHistory[index] = {
      ...this.executionHistory[index]!,
      status,
      completedAt,
      duration: completedAt.getTime() - startedAt.getTime(),
      ...(error === undefined ? {} : { error }),
    };
  }

  /**
   * Returns the recorded executions, oldest first.
   *
   * At most {@link MAX_EXECUTION_HISTORY} are kept. `JobExecution` and that
   * constant were both exported from the beginning and nothing produced or
   * read either.
   *
   * @param jobId - Restrict to one job's executions.
   */
  getExecutions(jobId?: string): readonly JobExecution[] {
    const all = [...this.executionHistory];
    return jobId === undefined
      ? all
      : all.filter((execution) => execution.jobId === jobId);
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

    // At the ceiling a due schedule cannot be dispatched, and arming a
    // zero-delay timer for it spun the event loop — about a tick per
    // millisecond — until an execution finished. The finishing execution
    // re-arms the timer, so waiting here loses nothing.
    if (this.inFlight.size >= this.maxConcurrency) {
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

/** Maps a failed execution onto the job state that describes it. */
function statusFor(error: unknown): JobState {
  if (error instanceof SchedulerJobTimeoutError) return "timed_out";
  if (error instanceof SchedulerJobCancelledError) return "cancelled";
  return "failed";
}
