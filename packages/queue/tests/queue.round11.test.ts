/**
 * @zudojs/queue — Round 11 regression tests.
 *
 * One describe block per finding.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { getEventListeners } from "node:events";
import { describe, it, expect, vi } from "vitest";

import {
  CONTEXT_METADATA_KEY,
  createInMemoryDeadLetterStore,
  createInMemoryQueue,
  createInMemoryQueueEventEmitter,
  createQueueName,
  createWorker,
  DEFAULT_DEAD_LETTER_JOBS,
} from "../src/index.js";
import type {
  DeadLetterJob,
  Job,
  QueueContextCarrier,
  QueueLogger,
} from "../src/index.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const tenants = new AsyncLocalStorage<{ readonly tenantId: string }>();
const tenantCarrier: QueueContextCarrier<string> = {
  key: "tenantId",
  capture: () => tenants.getStore()?.tenantId,
  restore: (tenantId, run) => tenants.run({ tenantId }, run),
};

/* ─── MSG-Q-01: enqueuer-supplied context metadata forged a tenant ──────── */

describe("MSG-Q-01", () => {
  it("ignores a forged context record when carriers are configured but capture nothing", async () => {
    const seen: (string | undefined)[] = [];
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r11-forge-carriers"),
      { pollInterval: 5, contextCarriers: [tenantCarrier] },
    );

    queue.process("job", async () => {
      seen.push(tenants.getStore()?.tenantId);
    });

    // No ambient tenant here: nothing legitimate to capture.
    const job = await queue.add(
      "job",
      { n: 1 },
      { metadata: { [CONTEXT_METADATA_KEY]: { tenantId: "victim-tenant" } } },
    );

    await vi.waitFor(() => expect(seen).toHaveLength(1), { timeout: 2000 });

    expect(seen[0]).toBeUndefined();
    expect(job.metadata?.[CONTEXT_METADATA_KEY]).toBeUndefined();

    await queue.close();
  });

  it("ignores a forged context record when the queue has no carriers at all", async () => {
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r11-forge-none"),
      { pollInterval: 5 },
    );

    const job = await queue.add(
      "job",
      { n: 1 },
      {
        metadata: {
          keep: "me",
          [CONTEXT_METADATA_KEY]: { tenantId: "victim-tenant" },
        },
      },
    );

    expect(job.metadata?.[CONTEXT_METADATA_KEY]).toBeUndefined();
    expect(job.metadata?.keep).toBe("me");

    await queue.close();
  });

  it("still restores the context a carrier really captured", async () => {
    const seen: (string | undefined)[] = [];
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r11-forge-real"),
      { pollInterval: 5, contextCarriers: [tenantCarrier] },
    );

    queue.process("job", async () => {
      seen.push(tenants.getStore()?.tenantId);
    });

    await tenants.run({ tenantId: "real" }, async () => {
      await queue.add(
        "job",
        { n: 1 },
        { metadata: { [CONTEXT_METADATA_KEY]: { tenantId: "victim-tenant" } } },
      );
    });

    await vi.waitFor(() => expect(seen).toHaveLength(1), { timeout: 2000 });

    expect(seen[0]).toBe("real");

    await queue.close();
  });
});

/* ─── MSG-Q-02: runJob leaked an abort listener per job ─────────────────── */

describe("MSG-Q-02", () => {
  it("removes its forwarding abort listener once the job settles", async () => {
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r11-listener-leak"),
      { pollInterval: 5, autoProcess: false },
    );

    queue.process("job", async () => undefined);

    const controller = new AbortController();

    for (let i = 0; i < 25; i++) {
      await queue.add("job", { n: i });
      const claimed = await queue.claimNextJob();
      expect(claimed).not.toBeNull();
      await queue.runJob(claimed as Job<{ n: number }>, {
        signal: controller.signal,
      });
    }

    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);

    await queue.close();
  });

  it("still forwards a consumer abort while the job is running", async () => {
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r11-listener-forward"),
      { pollInterval: 5, autoProcess: false },
    );

    let observed = false;
    queue.process("job", async (_job, context) => {
      await new Promise<void>((resolve) => {
        context.signal.addEventListener("abort", () => {
          observed = true;
          resolve();
        });
      });
    });

    const controller = new AbortController();
    await queue.add("job", { n: 1 });
    const claimed = await queue.claimNextJob();
    const run = queue.runJob(claimed as Job<{ n: number }>, {
      signal: controller.signal,
    });

    await sleep(20);
    controller.abort(new Error("consumer stopped"));
    await run;

    expect(observed).toBe(true);

    await queue.close();
  });
});

/* ─── MSG-Q-03: the default dead-letter store was unbounded ─────────────── */

describe("MSG-Q-03", () => {
  it("evicts the oldest entry past the configured cap", async () => {
    const store = createInMemoryDeadLetterStore<{ n: number }>({
      maxEntries: 3,
    });

    for (let i = 0; i < 10; i++) {
      await store.add({
        job: { id: `job-${i}` } as unknown as DeadLetterJob<{
          n: number;
        }>["job"],
        deadLetterAt: new Date(),
        error: new Error("boom"),
        attempts: 1,
      });
    }

    const all = await store.getAll();
    expect(all).toHaveLength(3);
    expect(all.map((entry) => entry.job.id)).toEqual([
      "job-7",
      "job-8",
      "job-9",
    ]);
    expect(await store.get("job-0" as never)).toBeNull();
  });

  it("defaults to a bounded store", () => {
    expect(DEFAULT_DEAD_LETTER_JOBS).toBeGreaterThan(0);
    expect(Number.isFinite(DEFAULT_DEAD_LETTER_JOBS)).toBe(true);
  });

  it("clears the store it created when the queue closes", async () => {
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r11-dlq-close"),
      { pollInterval: 5, defaultJobOptions: { attempts: 1 } },
    );

    queue.process("job", async () => {
      throw new Error("always fails");
    });

    await queue.add("job", { n: 1 });

    await vi.waitFor(
      async () => expect(await queue.getDeadLetterJobs()).toHaveLength(1),
      { timeout: 2000 },
    );

    await queue.close();

    expect(await queue.getDeadLetterJobs()).toHaveLength(0);
  });

  it("leaves a caller-supplied store alone on close", async () => {
    const store = createInMemoryDeadLetterStore<{ n: number }>();
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r11-dlq-supplied"),
      {
        pollInterval: 5,
        defaultJobOptions: { attempts: 1 },
        deadLetterStore: store as never,
      },
    );

    queue.process("job", async () => {
      throw new Error("always fails");
    });

    await queue.add("job", { n: 1 });

    await vi.waitFor(async () => expect(await store.getAll()).toHaveLength(1), {
      timeout: 2000,
    });

    await queue.close();

    expect(await store.getAll()).toHaveLength(1);
  });
});

/* ─── MSG-Q-04: a throwing listener never reached the queue's logger ────── */

describe("MSG-Q-04", () => {
  it("reports a throwing event listener through the queue's logger", async () => {
    const errors: string[] = [];
    const logger: QueueLogger = {
      info: () => {},
      error: (message) => {
        errors.push(message);
      },
    };

    const warnings: unknown[] = [];
    const onWarning = (warning: unknown): void => {
      warnings.push(warning);
    };
    process.on("warning", onWarning);

    try {
      const emitter = createInMemoryQueueEventEmitter();
      const queue = createInMemoryQueue<{ n: number }>(
        createQueueName("r11-listener-logger"),
        { pollInterval: 5, logger, eventEmitter: emitter },
      );

      emitter.on("job:created", () => {
        throw new Error("listener exploded");
      });

      await queue.add("job", { n: 1 });
      await sleep(20);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("job:created");
      expect(warnings).toHaveLength(0);

      await queue.close();
    } finally {
      process.off("warning", onWarning);
    }
  });

  it("accepts a logger directly on the emitter", async () => {
    const errors: string[] = [];
    const emitter = createInMemoryQueueEventEmitter({
      logger: {
        info: () => {},
        error: (message) => {
          errors.push(message);
        },
      },
    });

    emitter.on("job:started", () => {
      throw new Error("listener exploded");
    });
    emitter.emit("job:started", { job: { id: "x" } as never });

    await sleep(10);

    expect(errors).toHaveLength(1);
  });
});

/* ─── MSG-Q-05: four declared events nothing ever emitted ───────────────── */

describe("MSG-Q-05", () => {
  it("emits worker:started and worker:stopped on the queue emitter", async () => {
    const emitter = createInMemoryQueueEventEmitter();
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r11-worker-events"),
      { pollInterval: 5, eventEmitter: emitter },
    );

    const seen: string[] = [];
    emitter.on("worker:started", (data) => seen.push(`started:${data.workerId}`));
    emitter.on("worker:stopped", (data) => seen.push(`stopped:${data.workerId}`));

    queue.process("job", async () => undefined);

    const worker = createWorker("w-1", queue, { pollInterval: 5 });
    await worker.start();
    await sleep(20);
    await worker.stop();

    expect(seen).toEqual(["started:w-1", "stopped:w-1"]);

    await queue.close();
  });

  it("emits worker:error when a worker job throws", async () => {
    const emitter = createInMemoryQueueEventEmitter();
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r11-worker-error"),
      { pollInterval: 5, eventEmitter: emitter },
    );

    const errors: string[] = [];
    emitter.on("worker:error", (data) => errors.push(data.error.message));

    const worker = createWorker("w-2", queue, {
      pollInterval: 5,
      onError: () => {},
    });
    await worker.start();

    // Drive the worker's own failure path: a claim that rejects.
    const original = queue.claimNextJob.bind(queue);
    queue.claimNextJob = async () => {
      throw new Error("poll exploded");
    };

    await vi.waitFor(() => expect(errors.length).toBeGreaterThan(0), {
      timeout: 2000,
    });
    expect(errors[0]).toBe("poll exploded");

    queue.claimNextJob = original;
    await worker.forceStop();
    await queue.close();
  });

  it("emits job:cancelled when a running job is aborted from outside", async () => {
    const emitter = createInMemoryQueueEventEmitter();
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r11-job-cancelled"),
      { pollInterval: 5, autoProcess: false, eventEmitter: emitter },
    );

    const cancelled: string[] = [];
    emitter.on("job:cancelled", (data) => cancelled.push(data.job.id));

    queue.process("job", async (_job, context) => {
      await new Promise<void>((resolve, reject) => {
        context.signal.addEventListener("abort", () =>
          reject(new Error("cancelled")),
        );
      });
    });

    const controller = new AbortController();
    const added = await queue.add("job", { n: 1 });
    const claimed = await queue.claimNextJob();
    const run = queue.runJob(claimed as Job<{ n: number }>, {
      signal: controller.signal,
    });

    await sleep(20);
    controller.abort(new Error("drained"));
    await run;

    expect(cancelled).toEqual([added.id]);

    await queue.close();
  });

  it("does not report a plain timeout as a cancellation", async () => {
    const emitter = createInMemoryQueueEventEmitter();
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r11-timeout-not-cancelled"),
      {
        pollInterval: 5,
        autoProcess: false,
        eventEmitter: emitter,
        timeoutGraceMs: 50,
      },
    );

    const cancelled: string[] = [];
    const failed: string[] = [];
    emitter.on("job:cancelled", (data) => cancelled.push(data.job.id));
    emitter.on("job:failed", (data) => failed.push(data.job.id));

    queue.process("job", async (_job, context) => {
      await new Promise<void>((resolve) => {
        context.signal.addEventListener("abort", () => resolve());
      });
    });

    const added = await queue.add(
      "job",
      { n: 1 },
      { timeout: 20, attempts: 1 },
    );
    const claimed = await queue.claimNextJob();
    await queue.runJob(claimed as Job<{ n: number }>);

    expect(failed).toContain(added.id);
    expect(cancelled).toHaveLength(0);

    await queue.close();
  });
});
