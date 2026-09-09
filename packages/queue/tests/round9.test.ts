/**
 * @zudojs/queue — Round 9 regression tests.
 *
 * Each test pins a capability that was exported and documented but never
 * reached by any code path, or a public type that was narrower than the
 * implementation behind it.
 */

import { describe, it, expect } from "vitest";

import {
  BackoffType,
  DEFAULT_JOB_OPTIONS,
  JobState,
  assertProcessor,
  createBackoffOptions,
  createExponentialBackoff,
  createInMemoryQueue,
  createJob,
  createJobErrorResult,
  createJobName,
  createJobProgress,
  createJobResult,
  createJsonSerializer,
  createLoggingMiddleware,
  createProcessorRegistry,
  createQueueName,
  isProcessor,
} from "../src/index.js";
import type { BackoffOptions, JobContext, QueueLogger } from "../src/index.js";

const flush = (ms = 120): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/* ─── R9-QUE-01: Processor's return type was narrower than the runtime ──── */

describe("Processor return values", () => {
  it("accepts a processor that returns its own value", async () => {
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("returns"),
      { pollInterval: 5 },
    );

    queue.process("double", async (job) => job.data.n * 2);

    const job = await queue.add("double", { n: 21 });
    await flush();

    const settled = await queue.getJob(job.id);
    expect(settled?.state).toBe(JobState.COMPLETED);

    await queue.close();
  });

  it("carries a plain return value on job:completed", async () => {
    const results: unknown[] = [];
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("emits"),
      {
        pollInterval: 5,
        eventEmitter: {
          emit(event, data) {
            if (event === "job:completed") {
              results.push((data as { result: unknown }).result);
            }
          },
          on() {
            return () => undefined;
          },
        },
      },
    );

    queue.process("triple", async (job) => job.data.n * 3);
    await queue.add("triple", { n: 5 });
    await flush();

    expect(results).toEqual([15]);
    await queue.close();
  });

  it("still honours an explicit failing JobResult", async () => {
    const queue = createInMemoryQueue(createQueueName("explicit-fail"), {
      pollInterval: 5,
    });

    queue.process("nope", async () => createJobErrorResult("refused", 1));

    const job = await queue.add("nope", {});
    await flush();

    const settled = await queue.getJob(job.id);
    expect(settled?.state).toBe(JobState.DEAD_LETTER);
    await queue.close();
  });
});

/* ─── R9-QUE-02: BackoffType rejected the strings jobs are configured with ─ */

describe("BackoffStrategy", () => {
  it("accepts the string form a JSON config supplies", () => {
    // This is the assertion: before the widening, this object literal was a
    // type error even though the runtime compared against exactly this value.
    const backoff: BackoffOptions = { type: "fixed", delay: 100 };
    expect(backoff.type).toBe(BackoffType.FIXED);

    const fromEnum = createBackoffOptions(BackoffType.EXPONENTIAL, 50);
    expect(fromEnum.type).toBe("exponential");
  });

  it("computes the same delay from either spelling", () => {
    const fromString = createBackoffOptions("exponential", 100, {
      jitter: "none",
    });
    const fromEnum = createExponentialBackoff(100, { jitter: "none" });

    expect(fromString).toEqual(fromEnum);
  });
});

/* ─── R9-QUE-03: JobContext.log discarded everything ─────────────────────── */

describe("QueueOptions.logger", () => {
  it("delivers a processor's log lines to the configured logger", async () => {
    const lines: { message: string; data?: Record<string, unknown> }[] = [];
    const logger: QueueLogger = {
      info(message, data) {
        lines.push({ message, data });
      },
    };

    const queue = createInMemoryQueue(createQueueName("logged"), {
      pollInterval: 5,
      logger,
    });

    queue.process("work", async (_job, context: JobContext) => {
      context.log("halfway", { step: 2 });
    });

    await queue.add("work", {});
    await flush();

    expect(lines).toHaveLength(1);
    expect(lines[0]?.message).toBe("halfway");
    expect(lines[0]?.data?.step).toBe(2);
    // The context enriches the line with the job it came from.
    expect(lines[0]?.data?.queueName).toBe("logged");

    await queue.close();
  });

  it("stays silent, rather than throwing, when no logger is configured", async () => {
    const queue = createInMemoryQueue(createQueueName("unlogged"), {
      pollInterval: 5,
    });

    queue.process("work", async (_job, context: JobContext) => {
      context.log("nowhere");
    });

    const job = await queue.add("work", {});
    await flush();

    expect((await queue.getJob(job.id))?.state).toBe(JobState.COMPLETED);
    await queue.close();
  });
});

/* ─── R9-QUE-04: a non-function processor registered silently ────────────── */

describe("processor validation", () => {
  it("refuses a non-function processor with a message naming the job", () => {
    const queue = createInMemoryQueue(createQueueName("guarded"));

    expect(() =>
      // A processor loaded from a config map is exactly how this happens.
      queue.process("send", undefined as never),
    ).toThrow(/Processor for job "send" must be a function/);

    expect(() => queue.process("send", {} as never)).toThrow(
      /received object/,
    );
  });

  it("refuses a non-function processor in the registry too", () => {
    const registry = createProcessorRegistry();

    expect(() => registry.register("x.y", null as never)).toThrow(
      /must be a function; received null/,
    );
  });

  it("still accepts a real processor", () => {
    const registry = createProcessorRegistry();
    const processor = async (): Promise<void> => undefined;

    expect(isProcessor(processor)).toBe(true);
    expect(() => assertProcessor(processor, "x.y")).not.toThrow();
    registry.register("x.y", processor);
    expect(registry.has("x.y")).toBe(true);
  });
});

/* ─── R9-QUE-05: job defaults were duplicated instead of shared ──────────── */

describe("job defaults", () => {
  it("takes maxAttempts from the shared defaults", () => {
    const job = createJob({
      name: createJobName("j"),
      queueName: "q",
      data: {},
    });

    expect(job.maxAttempts).toBe(DEFAULT_JOB_OPTIONS.attempts);
  });

  it("leaves timeoutMs unset so a worker-level default can still apply", () => {
    const job = createJob({
      name: createJobName("j"),
      queueName: "q",
      data: {},
    });

    expect(job.timeoutMs).toBeUndefined();

    const explicit = createJob({
      name: createJobName("j"),
      queueName: "q",
      data: {},
      options: { timeout: 5_000 },
    });

    expect(explicit.timeoutMs).toBe(5_000);
  });
});

/* ─── R9-QUE-06: result constructors shipped untested ────────────────────── */

describe("job result constructors", () => {
  it("builds a success result carrying its data", () => {
    const result = createJobResult({ id: "u_1" }, 12);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: "u_1" });
    expect(result.durationMs).toBe(12);
    expect(Date.parse(result.timestamp)).not.toBeNaN();
  });

  it("builds a failure result carrying its message", () => {
    const result = createJobErrorResult("smtp refused", 4);

    expect(result.success).toBe(false);
    expect(result.error).toBe("smtp refused");
  });

  it("clamps progress into 0-100", () => {
    expect(createJobProgress(-10).percent).toBe(0);
    expect(createJobProgress(140).percent).toBe(100);
    expect(createJobProgress(40, { step: "encode" }).step).toBe("encode");
  });
});

/* ─── R9-QUE-07: logging middleware and serializer options untested ──────── */

describe("createLoggingMiddleware", () => {
  it("reports the start and the completion of a job", async () => {
    const messages: string[] = [];
    const middleware = createLoggingMiddleware({
      info: (message) => messages.push(message),
    });

    const job = createJob({
      name: createJobName("j"),
      queueName: "q",
      data: {},
    });

    await middleware({
      job,
      context: {} as JobContext,
      next: async () => undefined,
    });

    expect(messages).toEqual([
      "Job processing started",
      "Job processing completed",
    ]);
  });

  it("reports a failure and rethrows it", async () => {
    const messages: string[] = [];
    const middleware = createLoggingMiddleware({
      info: (message) => messages.push(message),
    });

    const job = createJob({
      name: createJobName("j"),
      queueName: "q",
      data: {},
    });

    await expect(
      middleware({
        job,
        context: {} as JobContext,
        next: async () => {
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");

    expect(messages).toContain("Job processing failed");
  });
});

describe("createJsonSerializer", () => {
  it("preserves types when asked to", () => {
    const serializer = createJsonSerializer({ preserveTypes: true });
    const encoded = serializer.serialize({ when: new Date(0) });

    expect(serializer.deserialize<{ when: Date }>(encoded).when).toBeInstanceOf(
      Date,
    );
  });

  it("pretty-prints when a space is supplied", () => {
    const serializer = createJsonSerializer({ space: 2 });
    expect(serializer.serialize({ a: 1 })).toContain("\n");
  });
});

/* ─── R9-QUE-08: adversarial — failure and shutdown with work in flight ─── */

describe("adversarial job handling", () => {
  it("dead-letters a job that throws once its attempts are exhausted", async () => {
    const queue = createInMemoryQueue(createQueueName("throwing"), {
      pollInterval: 5,
    });

    let calls = 0;
    queue.process("explode", async () => {
      calls++;
      throw new Error("upstream down");
    });

    const job = await queue.add(
      "explode",
      {},
      { attempts: 2, backoff: { type: "fixed", delay: 5, jitter: "none" } },
    );

    await flush(400);

    const settled = await queue.getJob(job.id);
    expect(settled?.state).toBe(JobState.DEAD_LETTER);
    expect(calls).toBeGreaterThanOrEqual(2);

    const dead = await queue.getDeadLetterJobs();
    expect(dead).toHaveLength(1);
    expect(dead[0]?.reason).toContain("upstream down");

    await queue.close();
  });

  it("never reports a throwing job as complete", async () => {
    const queue = createInMemoryQueue(createQueueName("no-false-success"), {
      pollInterval: 5,
    });

    queue.process("explode", async () => {
      throw new Error("mid-processing failure");
    });

    const job = await queue.add("explode", {}, { attempts: 1 });
    await flush(200);

    expect((await queue.getJob(job.id))?.state).not.toBe(JobState.COMPLETED);
    const stats = await queue.getStats();
    expect(stats.succeeded).toBe(0);

    await queue.close();
  });

  it("waits for a job in flight before tearing the queue down", async () => {
    const queue = createInMemoryQueue(createQueueName("draining"), {
      pollInterval: 5,
      closeTimeout: 2_000,
    });

    let finished = false;
    queue.process("slow", async () => {
      await flush(120);
      finished = true;
    });

    await queue.add("slow", {});
    await flush(40);

    await queue.close();

    // Closing while the job ran must not abandon it.
    expect(finished).toBe(true);
    expect(queue.isDisposed()).toBe(true);
  });

  it("aborts a job that outlasts the close timeout instead of hanging", async () => {
    const queue = createInMemoryQueue(createQueueName("stubborn"), {
      pollInterval: 5,
      closeTimeout: 50,
    });

    let aborted = false;
    queue.process("forever", async (_job, context) => {
      await new Promise<void>((resolve) => {
        context.signal.addEventListener("abort", () => {
          aborted = true;
          resolve();
        });
      });
    });

    await queue.add("forever", {});
    await flush(40);

    const started = Date.now();
    await queue.close();

    expect(Date.now() - started).toBeLessThan(2_000);
    expect(aborted).toBe(true);
  });

  it("refuses a payload the serializer cannot encode instead of storing it", async () => {
    const queue = createInMemoryQueue<Record<string, unknown>>(
      createQueueName("cyclic"),
    );

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    await expect(queue.add("j", cyclic)).rejects.toThrow(/not serializable/);
    expect((await queue.getStats()).waiting).toBe(0);

    await queue.close();
  });
});
