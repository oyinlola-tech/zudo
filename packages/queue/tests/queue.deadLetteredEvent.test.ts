/**
 * `job:dead-lettered` fires exactly once, when a job enters the dead-letter
 * store, so alerting on dead letters needs no attempt arithmetic and no
 * polling of `getStats().deadLettered`.
 */
import { describe, it, expect, expectTypeOf } from "vitest";

import { JobMaxAttemptsError, JobStalledError } from "@zudojs/errors";

import { InMemoryQueue } from "../src/inMemoryQueue/inMemoryQueue.core.js";
import { updateJobState } from "../src/job/job.core.js";
import { createQueueName, JobState } from "../src/jobTypes/jobTypes.type.js";
import type { Job, QueueEventMap } from "../src/index.js";

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("job:dead-lettered", () => {
  it("is typed with the job, the error and the reason", () => {
    expectTypeOf<QueueEventMap["job:dead-lettered"]>().toEqualTypeOf<{
      job: Job;
      error: Error;
      reason?: string;
    }>();
  });

  it("fires once, after the last failed attempt, never on a retryable one", async () => {
    const q = new InMemoryQueue(createQueueName("dlq-event"));
    const failedStates: string[] = [];
    const dead: QueueEventMap["job:dead-lettered"][] = [];
    q.events?.on("job:failed", ({ job }) => failedStates.push(job.state));
    q.events?.on("job:dead-lettered", (event) => dead.push(event));

    q.process("boom", async () => {
      throw new Error("smtp down");
    });
    const job = await q.add("boom", {}, {
      attempts: 3,
      backoff: { type: "fixed", delay: 5 },
    });

    for (let i = 0; i < 100 && dead.length === 0; i++) await settle(10);
    await settle(30);
    await q.close();

    expect(failedStates).toEqual(["failed", "failed", "failed"]);
    expect(dead).toHaveLength(1);
    const [event] = dead;
    expect(event?.job.id).toBe(job.id);
    expect(event?.job.state).toBe(JobState.DEAD_LETTER);
    expect(event?.job.attempt).toBe(3);
    expect(event?.error).toBeInstanceOf(JobMaxAttemptsError);
    expect(event?.reason).toBe("smtp down");
  });

  it("fires after the job is in the store and counted", async () => {
    const q = new InMemoryQueue(createQueueName("dlq-order"));
    const snapshots: Promise<[number, number]>[] = [];
    q.events?.on("job:dead-lettered", ({ job }) => {
      snapshots.push(
        Promise.all([q.getDeadLetterJobs(), q.getStats()]).then(
          ([all, stats]) => [
            all.filter((entry) => entry.job.id === job.id).length,
            stats.deadLettered,
          ],
        ),
      );
    });
    q.process("once", async () => {
      throw new Error("nope");
    });
    await q.add("once", {}, { attempts: 1 });

    for (let i = 0; i < 100 && snapshots.length === 0; i++) await settle(10);
    const seen = await Promise.all(snapshots);
    await q.close();

    expect(seen).toEqual([[1, 1]]);
  });

  it("fires for a job dead-lettered for stalling", async () => {
    const q = new InMemoryQueue(createQueueName("dlq-stall"), {
      stalledAfter: 10,
      maxStalledCount: 1,
    });
    const dead: QueueEventMap["job:dead-lettered"][] = [];
    q.events?.on("job:dead-lettered", (event) => dead.push(event));

    const job = await q.add("no-processor", {});
    (q as unknown as { jobs: Map<string, unknown> }).jobs.set(
      job.id,
      updateJobState(job, JobState.ACTIVE, {
        startedAt: new Date(Date.now() - 5_000).toISOString() as never,
      }),
    );
    await (q as unknown as { processTick(): Promise<void> }).processTick();
    await q.close();

    expect(dead).toHaveLength(1);
    expect(dead[0]?.job.state).toBe(JobState.DEAD_LETTER);
    expect(dead[0]?.error).toBeInstanceOf(JobStalledError);
    expect(dead[0]?.reason).toBe("Stalled 1 time(s).");
  });

  it("does not fire for a job that succeeds on a retry", async () => {
    const q = new InMemoryQueue(createQueueName("dlq-none"));
    let dead = 0;
    let completed = 0;
    q.events?.on("job:dead-lettered", () => dead++);
    q.events?.on("job:completed", () => completed++);
    let calls = 0;
    q.process("flaky", async () => {
      calls++;
      if (calls < 2) throw new Error("transient");
    });
    await q.add("flaky", {}, { attempts: 3, backoff: { type: "fixed", delay: 5 } });

    for (let i = 0; i < 100 && completed === 0; i++) await settle(10);
    await q.close();

    expect(completed).toBe(1);
    expect(dead).toBe(0);
  });
});
