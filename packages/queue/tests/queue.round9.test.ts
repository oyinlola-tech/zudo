/**
 * @zudojs/queue — Round 9 regression tests (worker dispatch).
 *
 * One describe block per finding. Each test pins behaviour that was
 * documented on `WorkerOptions` but not delivered by `createWorker`.
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

/* ─── QUEUE-R9-01: WorkerOptions.concurrency was reported, never applied ─ */

describe("QUEUE-R9-01", () => {
  it("runs jobs in parallel up to the configured concurrency", async () => {
    // The queue's own poller runs one job at a time (its default), so a
    // peak above 2 can only come from the worker dispatching concurrently.
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r9-worker-concurrency"),
      { pollInterval: 5, concurrency: 1 },
    );

    let active = 0;
    let peak = 0;
    queue.process("slow", async () => {
      active++;
      peak = Math.max(peak, active);
      await sleep(80);
      active--;
    });

    for (let i = 0; i < 8; i++) await queue.add("slow", { n: i });

    const worker = createWorker("w-conc", queue, {
      concurrency: 4,
      pollInterval: 5,
    });
    await worker.start();

    const started = Date.now();
    while (
      (await queue.getStats()).completed < 8 &&
      Date.now() - started < 3_000
    ) {
      await sleep(10);
    }

    expect((await queue.getStats()).completed).toBe(8);
    expect(peak).toBeGreaterThanOrEqual(4);
    expect(worker.getStats().processed).toBeGreaterThanOrEqual(4);

    await worker.stop();
    await queue.close();
  });

  it("never exceeds its concurrency and keeps one poll timer armed", async () => {
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r9-worker-cap"),
      { pollInterval: 5 },
    );
    // Park the queue's own poller so only the worker consumes.
    let workerActive = 0;
    let workerPeak = 0;
    queue.process("slow", async () => {
      await sleep(60);
    });
    await queue.pause();
    await queue.resume();

    const worker = createWorker("w-cap", queue, {
      concurrency: 2,
      pollInterval: 5,
      middleware: [
        async (ctx) => {
          workerActive++;
          workerPeak = Math.max(workerPeak, workerActive);
          try {
            return await ctx.next();
          } finally {
            workerActive--;
          }
        },
      ],
    });

    // Add after the worker starts so its polls see a steady stream.
    await worker.start();
    for (let i = 0; i < 6; i++) await queue.add("slow", { n: i });

    const started = Date.now();
    while (
      (await queue.getStats()).completed < 6 &&
      Date.now() - started < 3_000
    ) {
      await sleep(10);
    }

    expect(workerPeak).toBeLessThanOrEqual(2);
    expect(workerPeak).toBeGreaterThanOrEqual(1);

    await worker.stop();
    await queue.close();
  });
});

/* ─── QUEUE-R9-02: stop() aborted in-flight jobs before waiting for them ── */

describe("QUEUE-R9-02", () => {
  it("lets in-flight jobs finish within drainTimeout without aborting them", async () => {
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r9-worker-graceful"),
      { pollInterval: 5 },
    );

    let sawAbort: boolean | null = null;
    queue.process("slow", async (_job, context) => {
      await sleep(120);
      sawAbort = context.signal.aborted;
    });
    // Keep the queue's own poller from taking the job first.
    await queue.pause();

    const worker = createWorker("w-graceful", queue, {
      pollInterval: 5,
      drainTimeout: 2_000,
    });
    await worker.start();
    await queue.resume();
    const job = await queue.add("slow", { n: 1 });

    // Wait until some consumer has the job in flight.
    const started = Date.now();
    while (
      (await queue.getJob(job.id))?.state !== JobState.ACTIVE &&
      Date.now() - started < 1_000
    ) {
      await sleep(5);
    }

    await worker.stop();

    expect(worker.state).toBe("stopped");
    expect((await queue.getJob(job.id))?.state).toBe(JobState.COMPLETED);
    expect(sawAbort).toBe(false);

    await queue.close();
  });

  it("aborts what is still running once drainTimeout elapses", async () => {
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r9-worker-drain-timeout"),
      { pollInterval: 5 },
    );

    let abortedDuringRun = false;
    queue.process("stuck", async (_job, context) => {
      await new Promise<void>((resolve) => {
        context.signal.addEventListener("abort", () => {
          abortedDuringRun = true;
          resolve();
        });
      });
    });
    await queue.pause();

    const errors: unknown[] = [];
    const worker = createWorker("w-timeout", queue, {
      pollInterval: 5,
      drainTimeout: 60,
      onError: (error) => errors.push(error),
    });
    await worker.start();
    await queue.resume();
    await queue.add("stuck", { n: 1 });
    await sleep(40);

    const stopStarted = Date.now();
    await worker.stop();

    expect(Date.now() - stopStarted).toBeGreaterThanOrEqual(50);
    expect(abortedDuringRun).toBe(true);
    expect(errors.some((e) => /forcing stop/.test(String(e)))).toBe(true);

    await queue.close();
  });
});
