/**
 * @zudojs/queue — Round 10 regression tests (timeouts, consumers, timers).
 *
 * One describe block per finding.
 */

import { describe, it, expect } from "vitest";

import {
  createInMemoryQueue,
  createQueueName,
  createWorker,
  JobState,
} from "../src/index.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/* ─── INF-09: a timed-out job freed its slot while still running ─────────── */

describe("INF-09", () => {
  it("never runs a timed-out job beside its own retry", async () => {
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r10-timeout-overlap"),
      { pollInterval: 5, concurrency: 1 },
    );
    let starts = 0;
    let active = 0;
    let peak = 0;
    queue.process("stubborn", async () => {
      starts++;
      active++;
      peak = Math.max(peak, active);
      await sleep(120); // ignores context.signal
      active--;
    });

    const job = await queue.add("stubborn", { n: 1 }, {
      attempts: 3,
      timeout: 20,
      backoff: { type: "fixed", delay: 1 },
    });
    await sleep(700);
    await queue.close();

    expect(starts).toBe(3);
    expect(peak).toBe(1);
    expect(job.id).toBeTruthy();
  });

  it("abandons a processor that outlives timeoutGraceMs", async () => {
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r10-timeout-grace"),
      { pollInterval: 5, timeoutGraceMs: 30 },
    );
    queue.process("hung", () => new Promise<void>(() => {}));
    const job = await queue.add("hung", { n: 1 }, { attempts: 1, timeout: 10 });
    await sleep(150);
    expect((await queue.getJob(job.id))?.state).toBe(JobState.DEAD_LETTER);
    await queue.close();
  });
});

/* ─── INF-10: the queue's poller kept consuming after worker.stop() ──────── */

describe("INF-10", () => {
  it("stops consumption when the worker stops, and every job sees worker middleware", async () => {
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r10-worker-owner"),
      { pollInterval: 5 },
    );
    let completed = 0;
    let seenByMiddleware = 0;
    queue.process("job", async () => {
      completed++;
    });
    const worker = createWorker("w1", queue, {
      pollInterval: 5,
      middleware: [
        async (ctx) => {
          seenByMiddleware++;
          return ctx.next();
        },
      ],
    });
    await worker.start();
    for (let i = 0; i < 5; i++) await queue.add("job", { n: i });
    await sleep(150);
    await worker.stop();

    const late = await queue.add("job", { n: 99 });
    await sleep(150);

    expect(completed).toBe(5);
    expect(seenByMiddleware).toBe(5);
    expect((await queue.getJob(late.id))?.state).toBe(JobState.WAITING);
    await queue.close();
  });
});

/* ─── INF-11: a retry timer was deregistered as soon as it was registered ── */

describe("INF-11", () => {
  it("keeps a pending retry timer registered until it fires or close() clears it", async () => {
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r10-retry-timer"),
      { pollInterval: 5 },
    );
    const timers = (queue as unknown as {
      retryTimers: Map<string, unknown>;
    }).retryTimers;
    queue.process("fails", async () => {
      throw new Error("nope");
    });
    const job = await queue.add("fails", { n: 1 }, {
      attempts: 2,
      backoff: { type: "fixed", delay: 60_000 },
    });
    await sleep(80);

    expect((await queue.getJob(job.id))?.state).toBe(JobState.RETRYING);
    expect(timers.size).toBe(1);
    await queue.close();
    expect(timers.size).toBe(0);
  });
});
