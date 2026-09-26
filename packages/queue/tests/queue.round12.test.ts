/**
 * @zudojs/queue — Round 12 regression tests.
 *
 * One describe block per finding.
 */

import { describe, it, expect, vi } from "vitest";

import * as errorsApi from "@zudojs/errors";

import {
  JobDuplicateError,
  JobMaxAttemptsError,
  JobState,
  applyJitter,
  calculateRetryDelay,
  createInMemoryDeadLetterStore,
  createInMemoryQueue,
  createJobErrorResult,
  createQueueName,
  createUnrecoverableJobError,
  isUnrecoverableJobError,
  markUnrecoverable,
  resolveBackoff,
} from "../src/index.js";
import type { Job } from "../src/index.js";

import { selectNextJob } from "../src/inMemoryQueue/polling/index.js";

type Payload = { readonly n: number };

const fastRetries = {
  pollInterval: 5,
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: "fixed" as const, delay: 1 },
  },
};

interface WaitingJobShape {
  readonly id: string;
  readonly priority?: number;
  readonly createdAt?: string;
  readonly scheduledAt?: string;
}

function waitingJob(shape: WaitingJobShape): Job<unknown> {
  return {
    name: "job",
    queueName: "q",
    data: undefined,
    state: JobState.WAITING,
    priority: 0,
    attempt: 0,
    maxAttempts: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...shape,
  } as unknown as Job<unknown>;
}

/* ─── #4: selectNextJob parsed every waiting job's timestamps per poll ──── */

describe("#4", () => {
  const now = Date.parse("2026-01-01T01:00:00Z");

  it("keeps the ordering rules: priority, then when the job became runnable", () => {
    const early = waitingJob({ id: "early", createdAt: "2026-01-01T00:00:01.000Z" });
    const later = waitingJob({ id: "later", createdAt: "2026-01-01T00:00:02.000Z" });
    const urgent = waitingJob({ id: "urgent", priority: 5, createdAt: "2026-01-01T00:00:03.000Z" });
    const low = waitingJob({ id: "low", priority: -1, createdAt: "2026-01-01T00:00:00.000Z" });

    expect(selectNextJob([later, early, low], now)?.id).toBe("early");
    expect(selectNextJob([later, early, urgent, low], now)?.id).toBe("urgent");
    expect(selectNextJob([low], now)?.id).toBe("low");
  });

  it("skips a delayed job until it is due and orders it by when it fell due", () => {
    const delayed = waitingJob({
      id: "delayed",
      createdAt: "2026-01-01T00:00:00.000Z",
      scheduledAt: "2026-01-01T02:00:00.000Z",
    });
    const ready = waitingJob({ id: "ready", createdAt: "2026-01-01T00:30:00.000Z" });

    expect(selectNextJob([delayed, ready], now)?.id).toBe("ready");
    const afterDue = Date.parse("2026-01-01T03:00:00Z");
    expect(selectNextJob([delayed, ready], afterDue)?.id).toBe("ready");
    expect(selectNextJob([delayed], afterDue)?.id).toBe("delayed");
  });

  it("reads a replaced job record afresh instead of a stale cached time", () => {
    const first = waitingJob({ id: "a", createdAt: "2026-01-01T00:00:05.000Z" });
    const other = waitingJob({ id: "b", createdAt: "2026-01-01T00:00:03.000Z" });
    expect(selectNextJob([first, other], now)?.id).toBe("b");

    const replaced = {
      ...first,
      createdAt: "2026-01-01T00:00:01.000Z",
    } as unknown as Job<unknown>;
    expect(selectNextJob([replaced, other], now)?.id).toBe("a");
  });
});

/* ─── #75: jitter used Math.random with no injectable source ───────────── */

describe("#75", () => {
  it("exports applyJitter and lets the caller supply the randomness", () => {
    expect(applyJitter(1000, "full", () => 0.5)).toBe(500);
    expect(applyJitter(1000, "equal", () => 0.5)).toBe(750);
    expect(applyJitter(1000, "none", () => 0.5)).toBe(1000);
    expect(applyJitter(1000, undefined, () => 0.5)).toBe(1000);
  });

  it("threads the random source through calculateRetryDelay", () => {
    const backoff = { type: "exponential" as const, delay: 1000, jitter: "full" as const };

    expect(calculateRetryDelay(1, backoff, () => 0.25)).toBe(250);
    expect(calculateRetryDelay(2, backoff, () => 0.25)).toBe(500);
    expect(calculateRetryDelay(2, backoff, () => 0)).toBe(0);
    expect(resolveBackoff(undefined).jitter).toBe("full");
  });

  it("uses the queue's `random` option when scheduling a retry", async () => {
    const random = vi.fn(() => 0);
    const queue = createInMemoryQueue<Payload>(createQueueName("r12-random"), {
      pollInterval: 5,
      random,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "fixed", delay: 50, jitter: "full" },
      },
    });

    let attempts = 0;
    const done = new Promise<void>((resolve) => {
      queue.events?.on("job:completed", () => resolve());
    });
    queue.process("job", async () => {
      attempts++;
      if (attempts === 1) throw new Error("first attempt fails");
    });

    await queue.add("job", { n: 1 });
    await done;

    expect(attempts).toBe(2);
    expect(random).toHaveBeenCalled();

    await queue.close();
  });
});

/* ─── #91: no way to fail a job permanently; dead-letter message generic ─ */

describe("#91", () => {
  async function runUntilDeadLettered(
    processor: (job: Job<Payload>) => Promise<unknown>,
  ) {
    const deadLetterStore = createInMemoryDeadLetterStore<Payload>();
    const queue = createInMemoryQueue<Payload>(createQueueName("r12-dead"), {
      ...fastRetries,
      deadLetterStore,
    });

    const seen = { attempts: 0, retrying: 0, failed: [] as Error[] };
    const deadLettered = new Promise<{ error: Error; reason?: string }>(
      (resolve) => {
        queue.events?.on("job:dead-lettered", (event) => resolve(event));
      },
    );
    queue.events?.on("job:retrying", () => {
      seen.retrying++;
    });
    queue.events?.on("job:failed", (event) => {
      seen.failed.push(event.error);
    });
    queue.process("job", async (job) => {
      seen.attempts++;
      return processor(job);
    });

    const job = await queue.add("job", { n: 1 });
    const event = await deadLettered;
    const entry = await deadLetterStore.get(job.id);
    const final = await queue.getJob(job.id);
    await queue.close();

    return { seen, event, entry, final };
  }

  it("dead-letters a job that throws an unrecoverable error without retrying", async () => {
    const thrown = createUnrecoverableJobError("payload failed validation");
    const { seen, event, entry, final } = await runUntilDeadLettered(async () => {
      throw thrown;
    });

    expect(seen.attempts).toBe(1);
    expect(seen.retrying).toBe(0);
    expect(seen.failed[0]).toBe(thrown);
    expect(event.error).toBe(thrown);
    expect(event.reason).toBe("payload failed validation");
    expect(entry?.error.message).toBe("payload failed validation");
    expect(entry?.attempts).toBe(1);
    expect(final?.state).toBe(JobState.DEAD_LETTER);
    expect(final?.error).toBe("payload failed validation");
  });

  it("honours markUnrecoverable on any error and unrecoverable job results", async () => {
    const plain = markUnrecoverable(new TypeError("record no longer exists"));
    expect(isUnrecoverableJobError(plain)).toBe(true);
    expect(isUnrecoverableJobError(new Error("retry me"))).toBe(false);

    const viaThrow = await runUntilDeadLettered(async () => {
      throw plain;
    });
    expect(viaThrow.seen.attempts).toBe(1);
    expect(viaThrow.entry?.error.message).toBe("record no longer exists");

    const viaResult = await runUntilDeadLettered(async () =>
      createJobErrorResult("rejected by validator", 1, { unrecoverable: true }),
    );
    expect(viaResult.seen.attempts).toBe(1);
    expect(viaResult.seen.retrying).toBe(0);
    expect(viaResult.entry?.reason).toBe("rejected by validator");
  });

  it("still retries an ordinary failure and names the last error when attempts run out", async () => {
    const { seen, event, entry } = await runUntilDeadLettered(async () => {
      throw new Error("card declined");
    });

    expect(seen.attempts).toBe(4);
    expect(seen.retrying).toBe(3);
    expect(event.error).toBeInstanceOf(JobMaxAttemptsError);
    expect(entry?.error).toBeInstanceOf(JobMaxAttemptsError);
    expect(entry?.error.message).toContain("exceeded maximum attempts (4)");
    expect(entry?.error.message).toContain("Last error: card declined");
    expect(entry?.reason).toBe("card declined");
  });
});

/* ─── #124: JobDuplicateError had to be imported from @zudojs/errors ────── */

describe("#124", () => {
  it("re-exports the queue error classes it throws", () => {
    expect(JobDuplicateError).toBe(errorsApi.JobDuplicateError);
    expect(JobMaxAttemptsError).toBe(errorsApi.JobMaxAttemptsError);
  });

  it("throws the re-exported JobDuplicateError from add()", async () => {
    const queue = createInMemoryQueue<Payload>(createQueueName("r12-dup"), {
      pollInterval: 5,
    });

    await queue.add("job", { n: 1 }, { deduplicationKey: "once" });
    await expect(
      queue.add("job", { n: 2 }, { deduplicationKey: "once" }),
    ).rejects.toBeInstanceOf(JobDuplicateError);

    await queue.close();
  });
});
