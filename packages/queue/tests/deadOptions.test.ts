import { describe, it, expect } from "vitest";

import { InMemoryQueue } from "../src/inMemoryQueue/inMemoryQueue.core.js";
import { createQueueName } from "../src/jobTypes/jobTypes.type.js";
import { updateJobState } from "../src/job/job.core.js";
import { JobState } from "../src/jobTypes/jobTypes.type.js";
import { createWorker } from "../src/worker/worker.core.js";

/**
 * Options that were declared in the public type surface and never read.
 * Each test fails against the version where the option did nothing.
 */
describe("declared options are honoured", () => {
  it("stalledAfter reclaims a job whose consumer died", async () => {
    const q = new InMemoryQueue(createQueueName("stall"), {
      stalledAfter: 40,
      maxStalledCount: 5,
    });
    q.process("j", async () => {});

    const job = await q.add("j", {});

    // Simulate a consumer that claimed the job and then vanished: the
    // job is active but no in-flight controller owns it.
    (q as unknown as { jobs: Map<string, unknown> }).jobs.set(
      job.id,
      updateJobState(job, JobState.ACTIVE, {
        startedAt: new Date(Date.now() - 5_000).toISOString() as never,
      }),
    );

    await new Promise((r) => setTimeout(r, 300));

    const after = await q.getJob(job.id);
    await q.close();

    expect(after?.state).toBe("completed");
  });

  it("a job that stalls past maxStalledCount is dead-lettered", async () => {
    const q = new InMemoryQueue(createQueueName("stall2"), {
      stalledAfter: 10,
      maxStalledCount: 1,
    });

    const job = await q.add("no-processor", {});

    (q as unknown as { jobs: Map<string, unknown> }).jobs.set(
      job.id,
      updateJobState(job, JobState.ACTIVE, {
        startedAt: new Date(Date.now() - 5_000).toISOString() as never,
      }),
    );

    // No processor is registered, so nothing polls; drive one tick.
    await (q as unknown as { processTick(): Promise<void> }).processTick();

    const after = await q.getJob(job.id);
    const dead = await q.getDeadLetterJobs();
    await q.close();

    expect(after?.state).toBe("dead_letter");
    expect(dead.length).toBe(1);
  });

  it("stall reclamation is off by default", async () => {
    const q = new InMemoryQueue(createQueueName("stall3"));
    const job = await q.add("j", {});

    (q as unknown as { jobs: Map<string, unknown> }).jobs.set(
      job.id,
      updateJobState(job, JobState.ACTIVE, {
        startedAt: new Date(Date.now() - 60_000).toISOString() as never,
      }),
    );

    await (q as unknown as { processTick(): Promise<void> }).processTick();

    const after = await q.getJob(job.id);
    await q.close();

    expect(after?.state).toBe("active");
  });

  it("WorkerOptions.timeoutMs bounds a job that declares no timeout", async () => {
    const q = new InMemoryQueue(createQueueName("wt"));
    let aborted = false;

    q.process("slow", async (_job, ctx) => {
      ctx.signal.addEventListener("abort", () => {
        aborted = true;
      });
      await new Promise((r) => setTimeout(r, 2_000));
    });

    const job = await q.add("slow", {});
    const w = createWorker("wt", q, { pollInterval: 5, timeoutMs: 40 });

    await w.start();
    await new Promise((r) => setTimeout(r, 300));
    await w.stop();

    const after = await q.getJob(job.id);
    await q.close();

    expect(aborted).toBe(true);
    expect(after?.state).not.toBe("active");
  });
});
