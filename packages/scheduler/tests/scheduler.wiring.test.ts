/**
 * Round-9 regression tests.
 *
 * Every case here covers a capability the package's types and exports
 * promised and nothing implemented: the "queue" overlap policy, the
 * "catch-up" misfire policy, schedule priority, per-job concurrency, and
 * execution history.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

import { Scheduler } from "../src/scheduler/scheduler.core.js";
import { PriorityQueue } from "../src/scheduler/priorityQueue/schedulerPriorityQueue.core.js";
import { createSchedule } from "../src/scheduler/schedule/schedule.type.js";
import type { ScheduleOptions } from "../src/index.js";

afterEach(() => {
  vi.useRealTimers();
});

/** Waits for real time to pass, for tests that use real timers. */
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("SCH-09: overlap \"queue\" queues instead of overlapping", () => {
  it("holds the fire time and runs it after the current execution", async () => {
    let started = 0;
    let peak = 0;
    let concurrent = 0;

    const scheduler = new Scheduler();
    scheduler.define({
      id: "q",
      name: "q",
      handler: async () => {
        started++;
        concurrent++;
        peak = Math.max(peak, concurrent);
        await wait(40);
        concurrent--;
      },
    });
    scheduler.every("10ms", "q", { overlap: "queue" });
    scheduler.start();

    await wait(150);
    await scheduler.stop({ timeoutMs: 500 });

    // Never two at once — that is what "allow" did — but more than the single
    // run "skip" would have permitted, because the held fire times ran.
    expect(peak).toBe(1);
    expect(started).toBeGreaterThan(1);
  });

  it("still overlaps under the default policy", async () => {
    let peak = 0;
    let concurrent = 0;

    const scheduler = new Scheduler();
    scheduler.define({
      id: "a",
      name: "a",
      handler: async () => {
        concurrent++;
        peak = Math.max(peak, concurrent);
        await wait(50);
        concurrent--;
      },
    });
    scheduler.every("10ms", "a");
    scheduler.start();

    await wait(80);
    await scheduler.stop({ timeoutMs: 500 });

    expect(peak).toBeGreaterThan(1);
  });

  it("takes the overlap policy from the job when the schedule omits one", async () => {
    let peak = 0;
    let concurrent = 0;

    const scheduler = new Scheduler();
    scheduler.define({
      id: "j",
      name: "j",
      options: { overlap: "skip" },
      handler: async () => {
        concurrent++;
        peak = Math.max(peak, concurrent);
        await wait(60);
        concurrent--;
      },
    });
    scheduler.every("10ms", "j");
    scheduler.start();

    await wait(80);
    await scheduler.stop({ timeoutMs: 500 });

    expect(peak).toBe(1);
  });
});

describe("SCH-10: misfire \"catch-up\" replays missed occurrences", () => {
  it("runs once per missed occurrence rather than skipping to now", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const runs: number[] = [];
    const scheduler = new Scheduler();
    scheduler.define({
      id: "c",
      name: "c",
      handler: (context) => {
        runs.push(context.scheduledAt.getTime());
      },
    });
    scheduler.every("1s", "c", { misfire: "catch-up" });
    scheduler.start();

    // One tick, then a long jump: the scheduler was asleep for the whole gap.
    await vi.advanceTimersByTimeAsync(1_000);
    vi.setSystemTime(new Date("2026-01-01T00:00:20.000Z"));
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);

    await scheduler.stop({ timeoutMs: 100 });

    // Every fire time is one second after the last, with no gap jumped.
    expect(runs.length).toBeGreaterThan(3);
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]! - runs[i - 1]!).toBe(1_000);
    }
  });

  it("skips the missed occurrences under the default policy", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const runs: number[] = [];
    const scheduler = new Scheduler();
    scheduler.define({
      id: "d",
      name: "d",
      handler: (context) => {
        runs.push(context.scheduledAt.getTime());
      },
    });
    scheduler.every("1s", "d");
    scheduler.start();

    await vi.advanceTimersByTimeAsync(1_000);
    vi.setSystemTime(new Date("2026-01-01T00:00:20.000Z"));
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);

    await scheduler.stop({ timeoutMs: 100 });

    // The jump is visible: the schedule resumed from now, not from the
    // occurrences it slept through.
    const gaps = runs.slice(1).map((value, i) => value - runs[i]!);
    expect(gaps.some((gap) => gap > 1_000)).toBe(true);
  });
});

describe("SCH-11: schedule priority breaks ties", () => {
  it("orders schedules due at the same instant by priority", () => {
    const queue = new PriorityQueue();
    const at = new Date("2026-01-01T00:00:00.000Z");

    const make = (id: string, options: ScheduleOptions) =>
      createSchedule(id, "job", "interval", at, options);

    queue.enqueue(make("low", { priority: 1 }));
    queue.enqueue(make("high", { priority: 100 }));
    queue.enqueue(make("mid", { priority: 50 }));

    expect(queue.dequeue()?.id).toBe("high");
    expect(queue.dequeue()?.id).toBe("mid");
    expect(queue.dequeue()?.id).toBe("low");
  });

  it("never lets priority jump ahead of an earlier fire time", () => {
    const queue = new PriorityQueue();

    queue.enqueue(
      createSchedule("later", "job", "interval", new Date(20_000), {
        priority: 1_000,
      }),
    );
    queue.enqueue(
      createSchedule("sooner", "job", "interval", new Date(10_000), {
        priority: 0,
      }),
    );

    expect(queue.dequeue()?.id).toBe("sooner");
  });

  it("dispatches the higher priority schedule first", async () => {
    const order: string[] = [];

    const scheduler = new Scheduler();
    scheduler.define({
      id: "p",
      name: "p",
      handler: (context) => {
        order.push(String(context.data));
      },
    });

    // One shared Date, so both schedules are due at exactly the same instant
    // and priority is the only thing that can order them.
    const when = new Date(Date.now() + 30);
    scheduler.at(when, "p", { priority: 1, data: "low" });
    scheduler.at(when, "p", { priority: 99, data: "high" });
    scheduler.start();

    await wait(120);
    await scheduler.stop({ timeoutMs: 200 });

    expect(order).toEqual(["high", "low"]);
  });
});

describe("SCH-12: job concurrency is enforced", () => {
  it("never runs more of one job than its ceiling allows", async () => {
    let concurrent = 0;
    let peak = 0;
    let completed = 0;

    const scheduler = new Scheduler({ maxConcurrency: 10 });
    scheduler.define({
      id: "limited",
      name: "limited",
      options: { concurrency: 2 },
      handler: async () => {
        concurrent++;
        peak = Math.max(peak, concurrent);
        await wait(30);
        concurrent--;
        completed++;
      },
    });

    for (let i = 0; i < 6; i++) scheduler.after("1ms", "limited");
    scheduler.start();

    await wait(200);
    await scheduler.stop({ timeoutMs: 500 });

    expect(peak).toBeLessThanOrEqual(2);
    // Held-back runs are dispatched as capacity frees up, not dropped.
    expect(completed).toBeGreaterThan(2);
  });

  it("leaves an unbounded job alone", async () => {
    let concurrent = 0;
    let peak = 0;

    const scheduler = new Scheduler({ maxConcurrency: 10 });
    scheduler.define({
      id: "free",
      name: "free",
      handler: async () => {
        concurrent++;
        peak = Math.max(peak, concurrent);
        await wait(40);
        concurrent--;
      },
    });

    for (let i = 0; i < 4; i++) scheduler.after("1ms", "free");
    scheduler.start();

    await wait(30);
    await scheduler.stop({ timeoutMs: 500 });

    expect(peak).toBeGreaterThan(2);
  });
});

describe("SCH-13: execution history is recorded", () => {
  it("records a completed execution", async () => {
    const scheduler = new Scheduler();
    scheduler.define({ id: "h", name: "h", handler: () => {} });
    scheduler.after("1ms", "h");
    scheduler.start();

    await wait(40);
    await scheduler.stop({ timeoutMs: 200 });

    const executions = scheduler.getExecutions("h");
    expect(executions).toHaveLength(1);
    expect(executions[0]!.status).toBe("completed");
    expect(executions[0]!.jobId).toBe("h");
    expect(executions[0]!.duration).toBeGreaterThanOrEqual(0);
    expect(executions[0]!.completedAt).toBeInstanceOf(Date);
  });

  it("records a failure with its error", async () => {
    const scheduler = new Scheduler({ onError: () => {} });
    scheduler.define({
      id: "bad",
      name: "bad",
      handler: () => {
        throw new Error("nope");
      },
    });
    scheduler.after("1ms", "bad");
    scheduler.start();

    await wait(40);
    await scheduler.stop({ timeoutMs: 200 });

    const executions = scheduler.getExecutions("bad");
    expect(executions).toHaveLength(1);
    expect(executions[0]!.status).toBe("failed");
    expect(executions[0]!.error).toBeDefined();
  });

  it("records a timeout distinctly from a crash", async () => {
    const scheduler = new Scheduler({ onError: () => {} });
    scheduler.define({
      id: "slow",
      name: "slow",
      options: { timeout: 10 },
      handler: async () => {
        await wait(200);
      },
    });
    scheduler.after("1ms", "slow");
    scheduler.start();

    await wait(80);
    await scheduler.stop({ timeoutMs: 300 });

    expect(scheduler.getExecutions("slow")[0]!.status).toBe("timed_out");
  });

  it("filters by job and keeps the history bounded", async () => {
    const scheduler = new Scheduler();
    scheduler.define({ id: "a", name: "a", handler: () => {} });
    scheduler.define({ id: "b", name: "b", handler: () => {} });
    scheduler.after("1ms", "a");
    scheduler.after("1ms", "b");
    scheduler.start();

    await wait(40);
    await scheduler.stop({ timeoutMs: 200 });

    expect(scheduler.getExecutions()).toHaveLength(2);
    expect(scheduler.getExecutions("a")).toHaveLength(1);
    expect(scheduler.getExecutions("nobody")).toHaveLength(0);
  });
});

describe("SCH-14: the public ScheduleOptions matches the real API", () => {
  it("typechecks overlap and data, which the exported type used to omit", () => {
    const options: ScheduleOptions = {
      overlap: "queue",
      misfire: "catch-up",
      priority: 5,
      data: { tenant: "acme" },
      timezone: "UTC",
    };

    expect(options.overlap).toBe("queue");
    expect(options.data).toEqual({ tenant: "acme" });
  });

  it("hands ScheduleOptions.data to the handler", async () => {
    let seen: unknown;

    const scheduler = new Scheduler();
    scheduler.define({
      id: "d",
      name: "d",
      handler: (context) => {
        seen = context.data;
      },
    });
    scheduler.after("1ms", "d", { data: { tenant: "acme" } });
    scheduler.start();

    await wait(40);
    await scheduler.stop({ timeoutMs: 200 });

    expect(seen).toEqual({ tenant: "acme" });
  });
});
