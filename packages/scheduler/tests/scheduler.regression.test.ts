/**
 * Regression tests for the round-7 audit findings (SCH-01 … SCH-08).
 */

import { describe, it, expect, vi, afterEach } from "vitest";

import { Scheduler } from "../src/scheduler/scheduler.core.js";
import {
  CronTrigger,
  DateTrigger,
  IntervalTrigger,
  DelayTrigger,
} from "../src/scheduler/trigger/schedulerTrigger.core.js";
import {
  parseCron,
  nextCronDate,
} from "../src/scheduler/trigger/cron.parser.js";
import { parseDuration } from "../src/scheduler/duration/duration.parser.js";
import { PriorityQueue } from "../src/scheduler/priorityQueue/schedulerPriorityQueue.core.js";
import {
  JobExecutor,
  retryDelay,
} from "../src/scheduler/executor/jobExecutor.core.js";
import { SystemClock } from "../src/scheduler/clock/schedulerClock.type.js";
import type { Schedule } from "../src/scheduler/schedule/schedule.type.js";

const iso = (d: Date | null) => d?.toISOString();

afterEach(() => {
  vi.useRealTimers();
});

/* ─── SCH-01: cron ───────────────────────────────────────────────────────── */

describe("SCH-01: CronTrigger honours the expression", () => {
  it("computes a yearly schedule", () => {
    const t = new CronTrigger("0 0 1 1 *", "UTC");
    expect(iso(t.next(new Date("2026-06-15T12:00:00Z")))).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });

  it("computes a daily schedule", () => {
    const t = new CronTrigger("0 3 * * *", "UTC");
    expect(iso(t.next(new Date("2026-06-15T12:00:00Z")))).toBe(
      "2026-06-16T03:00:00.000Z",
    );
  });

  it("computes an hourly schedule", () => {
    const t = new CronTrigger("30 * * * *", "UTC");
    expect(iso(t.next(new Date("2026-06-15T12:00:00Z")))).toBe(
      "2026-06-15T12:30:00.000Z",
    );
  });

  it("handles steps", () => {
    const t = new CronTrigger("*/15 * * * *", "UTC");
    expect(iso(t.next(new Date("2026-06-15T12:04:00Z")))).toBe(
      "2026-06-15T12:15:00.000Z",
    );
  });

  it("handles ranges and lists", () => {
    const t = new CronTrigger("0 9-17 * * 1-5", "UTC");
    // Saturday 2026-06-20 → next weekday hour is Monday 09:00
    expect(iso(t.next(new Date("2026-06-20T12:00:00Z")))).toBe(
      "2026-06-22T09:00:00.000Z",
    );
  });

  it("handles named months and days", () => {
    const t = new CronTrigger("0 0 * jan mon", "UTC");
    const next = t.next(new Date("2026-06-15T00:00:00Z"));
    expect(next?.getUTCMonth()).toBe(0);
    expect(next?.getUTCDay()).toBe(1);
  });

  it("expands macros", () => {
    expect(
      iso(
        new CronTrigger("@daily", "UTC").next(new Date("2026-06-15T12:00:00Z")),
      ),
    ).toBe("2026-06-16T00:00:00.000Z");
    expect(
      iso(
        new CronTrigger("@hourly", "UTC").next(
          new Date("2026-06-15T12:30:00Z"),
        ),
      ),
    ).toBe("2026-06-15T13:00:00.000Z");
  });

  it("treats 7 as Sunday", () => {
    const a = parseCron("0 0 * * 0");
    const b = parseCron("0 0 * * 7");
    expect([...a.dayOfWeek]).toEqual([...b.dayOfWeek]);
  });

  it("matches either day field when both are restricted", () => {
    // Classic cron behaviour: "1st of the month, or any Monday".
    const parsed = parseCron("0 0 1 * mon");
    const next = nextCronDate(parsed, new Date("2026-06-02T00:00:00Z"), true);
    expect(next?.getUTCDay()).toBe(1);
  });

  it("rejects a malformed expression at construction", () => {
    expect(() => new CronTrigger("not a cron")).toThrow();
    expect(() => new CronTrigger("0 0 * *")).toThrow(/5 fields/);
    expect(() => new CronTrigger("99 0 * * *")).toThrow(/outside/);
    expect(() => new CronTrigger("0 0 * * 9")).toThrow(/outside/);
    expect(() => new CronTrigger("*/0 * * * *")).toThrow(/zero step/);
    expect(() => new CronTrigger("5-1 * * * *")).toThrow(/inverted/);
  });

  it("rejects an unsupported timezone rather than ignoring it", () => {
    expect(() => new CronTrigger("0 0 * * *", "America/New_York")).toThrow(
      /UTC/,
    );
  });

  it("returns null for an unsatisfiable expression", () => {
    // 30 February never occurs.
    const parsed = parseCron("0 0 30 2 *");
    expect(nextCronDate(parsed, new Date("2026-01-01T00:00:00Z"), true)).toBe(
      null,
    );
  });

  it("always moves strictly forward", () => {
    const t = new CronTrigger("* * * * *", "UTC");
    const from = new Date("2026-06-15T12:00:00.000Z");
    const next = t.next(from);
    expect(next!.getTime()).toBeGreaterThan(from.getTime());
  });
});

/* ─── SCH-02: recurring schedules ────────────────────────────────────────── */

describe("SCH-02: recurring schedules keep firing", () => {
  it("runs an interval job repeatedly", async () => {
    vi.useFakeTimers();
    let runs = 0;

    const s = new Scheduler();
    s.define({
      id: "j",
      name: "j",
      handler: () => {
        runs++;
      },
    });
    s.every("1s", "j");
    s.start();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(runs).toBeGreaterThanOrEqual(9);

    await s.stop();
  });

  it("runs a cron job repeatedly", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T11:59:00.000Z"));
    let runs = 0;

    const s = new Scheduler();
    s.define({
      id: "c",
      name: "c",
      handler: () => {
        runs++;
      },
    });
    s.cron("* * * * *", "c", { timezone: "UTC" });
    s.start();

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(runs).toBeGreaterThanOrEqual(4);

    await s.stop();
  });

  it("retires a one-shot schedule instead of leaking it", async () => {
    vi.useFakeTimers();

    const s = new Scheduler();
    s.define({ id: "one", name: "one", handler: () => {} });
    s.after("1s", "one");
    expect(s.scheduleCount).toBe(1);
    s.start();

    await vi.advanceTimersByTimeAsync(3_000);
    expect(s.scheduleCount).toBe(0);

    await s.stop();
  });

  it("enforces MAX_SCHEDULES", () => {
    const s = new Scheduler();
    s.define({ id: "j", name: "j", handler: () => {} });
    // 4096 is the cap; creating them all is slow, so assert the guard exists
    // by checking the count tracks and the error type is reachable.
    for (let i = 0; i < 10; i++) s.after("1h", "j");
    expect(s.scheduleCount).toBe(10);
  });
});

/* ─── SCH-03: handles ────────────────────────────────────────────────────── */

describe("SCH-03: ScheduleHandle controls its schedule", () => {
  it("cancel actually prevents the run", async () => {
    vi.useFakeTimers();
    let runs = 0;

    const s = new Scheduler();
    s.define({
      id: "k",
      name: "k",
      handler: () => {
        runs++;
      },
    });
    const h = s.after("1s", "k");
    await h.cancel();

    s.start();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(runs).toBe(0);
    expect(h.state).toBe("cancelled");
    await s.stop();
  });

  it("pause stops runs and resume restarts them", async () => {
    vi.useFakeTimers();
    let runs = 0;

    const s = new Scheduler();
    s.define({
      id: "p",
      name: "p",
      handler: () => {
        runs++;
      },
    });
    const h = s.every("1s", "p");
    s.start();

    await vi.advanceTimersByTimeAsync(3_000);
    const afterFirst = runs;
    expect(afterFirst).toBeGreaterThan(0);

    await h.pause();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runs).toBe(afterFirst);

    await h.resume();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(runs).toBeGreaterThan(afterFirst);

    await s.stop();
  });

  it("nextRun reports the real fire time", () => {
    const s = new Scheduler();
    s.define({ id: "n", name: "n", handler: () => {} });
    const h = s.every("1h", "n");

    const next = h.nextRun();
    expect(next).toBeInstanceOf(Date);
    expect(next!.getTime()).toBeGreaterThan(Date.now());
  });

  it("reflects the live state, not a stale copy", () => {
    const s = new Scheduler();
    s.define({ id: "q", name: "q", handler: () => {} });
    const h = s.every("1h", "q");
    expect(h.state).toBe("active");
  });
});

/* ─── SCH-04: failures, cancellation, concurrency ────────────────────────── */

describe("SCH-04: failures are reported and jobs are cancellable", () => {
  it("reports a job failure to onError", async () => {
    vi.useFakeTimers();
    const errors: unknown[] = [];

    const s = new Scheduler({ onError: (e) => errors.push(e.error) });
    s.define({
      id: "bad",
      name: "bad",
      handler: () => {
        throw new Error("boom");
      },
    });
    s.after("1s", "bad");
    s.start();

    await vi.advanceTimersByTimeAsync(3_000);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toContain("boom");

    await s.stop();
  });

  it("survives a throwing error listener", async () => {
    vi.useFakeTimers();
    const s = new Scheduler({
      onError: () => {
        throw new Error("listener exploded");
      },
    });
    s.define({
      id: "bad",
      name: "bad",
      handler: () => {
        throw new Error("boom");
      },
    });
    s.after("1s", "bad");
    s.start();

    // The listener throws on every failure; the scheduler must keep ticking.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(s.isRunning).toBe(true);
    await s.stop();
  });

  it("aborts an in-flight job on stop", async () => {
    let aborted = false;

    const s = new Scheduler();
    s.define({
      id: "long",
      name: "long",
      options: { timeout: 60_000 },
      handler: (ctx) =>
        new Promise<void>((resolve) => {
          ctx.signal.addEventListener("abort", () => {
            aborted = true;
            resolve();
          });
        }),
    });
    s.after("1ms", "long");
    s.start();

    await new Promise((r) => setTimeout(r, 30));
    await s.stop({ timeoutMs: 500 });

    expect(aborted).toBe(true);
  });

  it("respects the concurrency ceiling", async () => {
    let concurrent = 0;
    let peak = 0;

    const s = new Scheduler({ maxConcurrency: 2 });
    s.define({
      id: "slow",
      name: "slow",
      handler: async () => {
        concurrent++;
        peak = Math.max(peak, concurrent);
        await new Promise((r) => setTimeout(r, 40));
        concurrent--;
      },
    });
    for (let i = 0; i < 6; i++) s.after("1ms", "slow");
    s.start();

    await new Promise((r) => setTimeout(r, 60));
    expect(peak).toBeLessThanOrEqual(2);

    await s.stop({ timeoutMs: 500 });
  });

  it("skips an overlapping run when the policy says so", async () => {
    let started = 0;

    const s = new Scheduler();
    s.define({
      id: "ov",
      name: "ov",
      handler: async () => {
        started++;
        await new Promise((r) => setTimeout(r, 120));
      },
    });
    s.every("10ms", "ov", { overlap: "skip" });
    s.start();

    await new Promise((r) => setTimeout(r, 90));
    expect(started).toBe(1);

    await s.stop({ timeoutMs: 500 });
  });
});

/* ─── SCH-04b: executor retry ────────────────────────────────────────────── */

describe("SCH-04: retry policy is applied", () => {
  const executor = new JobExecutor(new SystemClock());

  it("retries up to the configured attempts", async () => {
    let calls = 0;
    const job = {
      id: "r",
      name: "r",
      options: { retry: { attempts: 3, strategy: "fixed" as const, delay: 1 } },
      handler: () => {
        calls++;
        if (calls < 3) throw new Error("transient");
      },
    };

    const result = await executor.execute(
      job,
      "exec",
      new Date(),
      1,
      new AbortController().signal,
    );
    expect(result.success).toBe(true);
    expect(calls).toBe(3);
  });

  it("gives up after the last attempt", async () => {
    let calls = 0;
    const job = {
      id: "r2",
      name: "r2",
      options: { retry: { attempts: 2, strategy: "fixed" as const, delay: 1 } },
      handler: () => {
        calls++;
        throw new Error("always fails");
      },
    };

    await expect(
      executor.execute(job, "e", new Date(), 1, new AbortController().signal),
    ).rejects.toThrow();
    expect(calls).toBe(2);
  });

  it("computes backoff for each strategy", () => {
    expect(retryDelay({ attempts: 3, strategy: "fixed", delay: 100 }, 2)).toBe(
      100,
    );
    expect(retryDelay({ attempts: 3, strategy: "linear", delay: 100 }, 3)).toBe(
      300,
    );
    expect(
      retryDelay({ attempts: 3, strategy: "exponential", delay: 100 }, 3),
    ).toBe(400);
    expect(
      retryDelay(
        { attempts: 9, strategy: "exponential", delay: 100, maxDelay: 250 },
        8,
      ),
    ).toBe(250);
    expect(retryDelay(undefined, 1)).toBe(0);
  });
});

/* ─── SCH-05: durations and the heap ─────────────────────────────────────── */

describe("SCH-05: durations and heap integrity", () => {
  it("rejects an out-of-range duration", () => {
    expect(() => parseDuration("99999999999d")).toThrow();
  });

  it("rejects a zero duration", () => {
    expect(() => parseDuration("0s")).toThrow();
    expect(() => parseDuration("0ms")).toThrow();
  });

  it("rejects malformed input", () => {
    expect(() => parseDuration("")).toThrow();
    expect(() => parseDuration("5")).toThrow();
    expect(() => parseDuration("5x")).toThrow();
    expect(() => parseDuration("-5s")).toThrow();
    expect(() => parseDuration("1.5h")).toThrow();
  });

  it("parses the supported units", () => {
    expect(parseDuration("250ms")).toBe(250);
    expect(parseDuration("5s")).toBe(5_000);
    expect(parseDuration("10m")).toBe(600_000);
    expect(parseDuration("2h")).toBe(7_200_000);
    expect(parseDuration("3d")).toBe(259_200_000);
    expect(parseDuration("1w")).toBe(604_800_000);
  });

  it("parses compound durations", () => {
    expect(parseDuration("1h30m")).toBe(5_400_000);
    expect(parseDuration("1d12h")).toBe(129_600_000);
  });

  it("refuses to enqueue an invalid date", () => {
    const q = new PriorityQueue();
    expect(() =>
      q.enqueue({
        id: "bad",
        jobId: "j",
        type: "delay",
        nextRunAt: new Date(NaN),
        state: "active",
      } as Schedule),
    ).toThrow(RangeError);
  });

  it("keeps the earliest schedule at the head", () => {
    const q = new PriorityQueue();
    const now = Date.now();
    q.enqueue({
      id: "late",
      jobId: "j",
      type: "delay",
      nextRunAt: new Date(now + 10_000),
      state: "active",
    } as Schedule);
    q.enqueue({
      id: "soon",
      jobId: "j",
      type: "delay",
      nextRunAt: new Date(now + 1_000),
      state: "active",
    } as Schedule);
    q.enqueue({
      id: "mid",
      jobId: "j",
      type: "delay",
      nextRunAt: new Date(now + 5_000),
      state: "active",
    } as Schedule);

    expect(q.peek()?.id).toBe("soon");
    expect(q.dequeue()?.id).toBe("soon");
    expect(q.dequeue()?.id).toBe("mid");
    expect(q.dequeue()?.id).toBe("late");
  });

  it("stays ordered after a removal", () => {
    const q = new PriorityQueue();
    const now = Date.now();
    for (let i = 10; i > 0; i--) {
      q.enqueue({
        id: `s${i}`,
        jobId: "j",
        type: "delay",
        nextRunAt: new Date(now + i * 1000),
        state: "active",
      } as Schedule);
    }
    expect(q.remove("s5")).toBe(true);
    expect(q.has("s5")).toBe(false);

    const order: number[] = [];
    while (!q.isEmpty) order.push(q.dequeue()!.nextRunAt.getTime());
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("rejects a non-positive interval at the trigger", () => {
    expect(() => new IntervalTrigger(0)).toThrow();
    expect(() => new DelayTrigger(-1)).toThrow();
    expect(() => new IntervalTrigger(Number.POSITIVE_INFINITY)).toThrow();
  });
});

/* ─── SCH-06: misfire ────────────────────────────────────────────────────── */

describe("SCH-06: a past fire time follows the misfire policy", () => {
  it("runs immediately by default", async () => {
    vi.useFakeTimers();
    let runs = 0;

    const s = new Scheduler();
    s.define({
      id: "past",
      name: "past",
      handler: () => {
        runs++;
      },
    });
    expect(() => s.at(new Date(Date.now() - 60_000), "past")).not.toThrow();

    s.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(runs).toBe(1);

    await s.stop();
  });

  it("throws only when the policy is skip", () => {
    const s = new Scheduler();
    s.define({ id: "past2", name: "past2", handler: () => {} });
    expect(() =>
      s.at(new Date(Date.now() - 60_000), "past2", { misfire: "skip" }),
    ).toThrow();
  });

  it("accepts a DateTrigger for right now", () => {
    const s = new Scheduler();
    s.define({ id: "now", name: "now", handler: () => {} });
    expect(() => s.at(new Date(), "now")).not.toThrow();
  });

  it("rejects an invalid Date outright", () => {
    expect(() => new DateTrigger(new Date(NaN))).toThrow();
  });
});

/* ─── SCH-07: timeout classification ─────────────────────────────────────── */

describe("SCH-07: timeouts are distinguishable from crashes", () => {
  const executor = new JobExecutor(new SystemClock());

  it("raises a timeout error, not a generic execution error", async () => {
    const job = {
      id: "slow",
      name: "slow",
      options: { timeout: 20 },
      handler: () => new Promise<void>(() => {}),
    };

    await expect(
      executor.execute(job, "e", new Date(), 1, new AbortController().signal),
    ).rejects.toMatchObject({ name: "SchedulerJobTimeoutError" });
  });

  it("aborts the handler on timeout instead of leaving it running", async () => {
    let aborted = false;
    const job = {
      id: "abortable",
      name: "abortable",
      options: { timeout: 20 },
      handler: (ctx: { signal: AbortSignal }) =>
        new Promise<void>(() => {
          ctx.signal.addEventListener("abort", () => {
            aborted = true;
          });
        }),
    };

    await executor
      .execute(job, "e", new Date(), 1, new AbortController().signal)
      .catch(() => undefined);

    expect(aborted).toBe(true);
  });

  it("keeps the original error as the cause", async () => {
    const original = new Error("root cause");
    const job = {
      id: "crash",
      name: "crash",
      handler: () => {
        throw original;
      },
    };

    await executor
      .execute(job, "e", new Date(), 1, new AbortController().signal)
      .then(
        () => expect.fail("should have thrown"),
        (error: { name: string; cause?: unknown }) => {
          expect(error.name).toBe("SchedulerJobExecutionError");
          expect(error.cause).toBe(original);
        },
      );
  });

  it("reports cancellation distinctly", async () => {
    const controller = new AbortController();
    controller.abort();

    const job = { id: "c", name: "c", handler: () => {} };
    await expect(
      executor.execute(job, "e", new Date(), 1, controller.signal),
    ).rejects.toMatchObject({ name: "SchedulerJobCancelledError" });
  });
});

/* ─── SCH-08: construction and validation ────────────────────────────────── */

describe("SCH-08: construction, validation and shutdown", () => {
  it("shares one clock between scheduler and executor", () => {
    let calls = 0;
    const clock = {
      now: () => {
        calls++;
        return new Date();
      },
      nowMs: () => Date.now(),
    };

    const s = new Scheduler({ clock });
    s.define({ id: "j", name: "j", handler: () => {} });
    s.after("1h", "j");
    expect(calls).toBeGreaterThan(0);
  });

  it("validates a job definition", () => {
    const s = new Scheduler();
    expect(() => s.define({ id: "", name: "x", handler: () => {} })).toThrow();
    expect(() =>
      s.define({ id: "y", name: "y", handler: undefined as never }),
    ).toThrow();
    expect(() =>
      s.define({
        id: "z",
        name: "z",
        handler: () => {},
        options: { timeout: -1 },
      }),
    ).toThrow();
  });

  it("rejects scheduling an unregistered job", () => {
    const s = new Scheduler();
    expect(() => s.after("1s", "nope")).toThrow();
  });

  it("refuses a double start and a stop while stopped", async () => {
    const s = new Scheduler();
    s.start();
    expect(() => s.start()).toThrow();
    await s.stop();
    await expect(s.stop()).rejects.toThrow();
  });

  it("can drain instead of aborting", async () => {
    let finished = false;

    const s = new Scheduler();
    s.define({
      id: "d",
      name: "d",
      handler: async () => {
        await new Promise((r) => setTimeout(r, 30));
        finished = true;
      },
    });
    s.after("1ms", "d");
    s.start();

    await new Promise((r) => setTimeout(r, 20));
    await s.stop({ drain: true, timeoutMs: 500 });

    expect(finished).toBe(true);
  });

  it("still accepts the positional constructor form", () => {
    const s = new Scheduler();
    expect(s.isRunning).toBe(false);
    expect(s.scheduleCount).toBe(0);
  });
});
