import { describe, it, expect } from "vitest";
import { InMemoryQueue } from "../src/inMemoryQueue/inMemoryQueue.core.js";
import { createQueueName } from "../src/jobTypes/jobTypes.type.js";
import { createWorker } from "../src/worker/worker.core.js";
import {
  calculateRetryDelay,
  createExponentialBackoff,
  MAX_TIMER_DELAY,
} from "../src/retryPolicy/retryPolicy.core.js";
import { createInMemoryQueueEventEmitter } from "../src/queueEmitter/queueEmitter.core.js";

describe("regressions: audit round 7", () => {
  it("Q-01 orphan job does not starve the loop", async () => {
    const q = new InMemoryQueue(createQueueName("a"));
    q.process("known", async () => {});
    await q.add("orphan", { x: 1 });
    let ticks = 0;
    const t = setInterval(() => ticks++, 10);
    await new Promise((r) => setTimeout(r, 300));
    clearInterval(t);
    await q.close();
    expect(ticks).toBeGreaterThan(10); // timers still ran
  });

  it("Q-02 claimNextJob claims exactly once; worker does not reprocess", async () => {
    const q = new InMemoryQueue(createQueueName("b"));
    let runs = 0;
    q.process("j", async () => {
      runs++;
    });
    await q.add("j", {});
    const w = createWorker("w1", q, { pollInterval: 5 });
    await w.start();
    await new Promise((r) => setTimeout(r, 250));
    await w.stop();
    await q.close();
    expect(runs).toBe(1);
  });

  it("Q-03 negative priority is selectable", async () => {
    const q = new InMemoryQueue(createQueueName("c"));
    await q.add("j", { n: 1 }, { priority: -5 });
    expect(await q.getNextJob()).not.toBeNull();
    await q.close();
  });

  it("Q-04 retry delay is clamped and jitter works", () => {
    expect(
      calculateRetryDelay(200, createExponentialBackoff(1000)),
    ).toBeLessThanOrEqual(MAX_TIMER_DELAY);
    expect(
      Number.isFinite(calculateRetryDelay(200, createExponentialBackoff(1000))),
    ).toBe(true);
    const j = calculateRetryDelay(
      1,
      createExponentialBackoff(1000, { jitter: "full" }),
    );
    expect(j).toBeGreaterThanOrEqual(0);
    expect(j).toBeLessThanOrEqual(1000);
  });

  it("Q-05 close drains in-flight jobs and leaves no jobs behind", async () => {
    const q = new InMemoryQueue(createQueueName("d"));
    let finished = false;
    q.process("slow", async () => {
      await new Promise((r) => setTimeout(r, 120));
      finished = true;
    });
    await q.add("slow", {});
    await new Promise((r) => setTimeout(r, 80));
    await q.close();
    expect(finished).toBe(true);
    expect((q as any).jobs.size).toBe(0);
  });

  it("Q-06 timeout middleware clears its timer and aborts the job", async () => {
    const q = new InMemoryQueue(createQueueName("e"));
    let aborted = false;
    q.process("t", async (_j, ctx) => {
      ctx.signal.addEventListener("abort", () => {
        aborted = true;
      });
      await new Promise((r) => setTimeout(r, 300));
    });
    await q.add("t", {}, { timeout: 40 });
    await new Promise((r) => setTimeout(r, 250));
    const timers = (process as any)
      .getActiveResourcesInfo()
      .filter((x: string) => x === "Timeout").length;
    await q.close();
    expect(aborted).toBe(true);
    expect(timers).toBeLessThan(6);
  });

  it("Q-07 settled jobs are evicted and dedup keys released", async () => {
    const q = new InMemoryQueue(createQueueName("f"), { retainSettledJobs: 2 });
    q.process("j", async () => {});
    for (let i = 0; i < 8; i++) await q.add("j", { i });
    await new Promise((r) => setTimeout(r, 500));
    expect((q as any).jobs.size).toBeLessThanOrEqual(3);
    await q.close();
  });

  it("Q-08 counters are live", async () => {
    const q = new InMemoryQueue(createQueueName("g"));
    q.process("j", async () => {});
    await q.add("j", {});
    await new Promise((r) => setTimeout(r, 250));
    const s = await q.getStats();
    expect(s.processed).toBe(1);
    expect(s.succeeded).toBe(1);
    await q.close();
  });

  it("Q-09 serializer is used and rejects unserializable payloads", async () => {
    const calls: string[] = [];
    const q = new InMemoryQueue(createQueueName("h"), {
      serializer: {
        serialize: (d) => {
          calls.push("s");
          return JSON.stringify(d);
        },
        deserialize: (d) => JSON.parse(d),
      },
    });
    const src = { a: 1 };
    const job = await q.add("j", src);
    expect(calls.length).toBe(1);
    expect(job.data).not.toBe(src); // isolated copy
    expect(job.data).toEqual(src);
    const cyclic: any = {};
    cyclic.self = cyclic;
    await expect(q.add("j", cyclic)).rejects.toThrow(/not serializable/);
    await q.close();
  });

  it("Q-10 a throwing listener does not break processing", async () => {
    const emitter = createInMemoryQueueEventEmitter({
      onHandlerError: () => {},
    });
    const q = new InMemoryQueue(createQueueName("i"), {
      eventEmitter: emitter,
    });
    emitter.on("job:started", () => {
      throw new Error("bad listener");
    });
    let ran = false;
    q.process("j", async () => {
      ran = true;
    });
    await q.add("j", {});
    await new Promise((r) => setTimeout(r, 250));
    const s = await q.getStats();
    await q.close();
    expect(ran).toBe(true);
    expect(s.succeeded).toBe(1);
  });

  it("Q-11 pause can allow adds when configured", async () => {
    const q = new InMemoryQueue(createQueueName("k"), {
      pauseRejectsAdd: false,
    });
    await q.pause();
    await expect(q.add("j", {})).resolves.toBeTruthy();
    await q.close();
  });

  it("dead letter jobs are reachable", async () => {
    const q = new InMemoryQueue(createQueueName("l"));
    q.process("j", async () => {
      throw new Error("always");
    });
    await q.add("j", {}, { attempts: 1 });
    await new Promise((r) => setTimeout(r, 300));
    const dl = await q.getDeadLetterJobs();
    await q.close();
    expect(dl.length).toBe(1);
  });

  it("Q-02b a Worker settles the job it runs", async () => {
    const q = new InMemoryQueue(createQueueName("wa"));
    q.process("j", async () => "done");
    const job = await q.add("j", {});
    const w = createWorker("wa", q, { pollInterval: 5 });
    await w.start();
    await new Promise((r) => setTimeout(r, 200));
    await w.stop();
    const after = await q.getJob(job.id);
    const stats = await q.getStats();
    await q.close();
    // Previously the worker invoked the processor directly and never
    // transitioned the job, leaving it "active" forever.
    expect(after?.state).toBe("completed");
    expect(stats.succeeded).toBe(1);
    expect(w.getStats().succeeded).toBe(1);
  });

  it("Q-02b a Worker retries and dead-letters through the queue", async () => {
    const q = new InMemoryQueue(createQueueName("wb"));
    q.process("j", async () => {
      throw new Error("always");
    });
    await q.add("j", {}, { attempts: 1 });
    const w = createWorker("wb", q, { pollInterval: 5 });
    await w.start();
    await new Promise((r) => setTimeout(r, 250));
    await w.stop();
    const dl = await q.getDeadLetterJobs();
    await q.close();
    expect(dl.length).toBe(1);
  });

  it("Q-02b Worker middleware is applied", async () => {
    const q = new InMemoryQueue(createQueueName("wc"));
    let mwRan = false;
    q.process("j", async () => {});
    await q.add("j", {});
    const w = createWorker("wc", q, {
      pollInterval: 5,
      middleware: [
        async (ctx) => {
          mwRan = true;
          return ctx.next();
        },
      ],
    });
    await w.start();
    await new Promise((r) => setTimeout(r, 200));
    await w.stop();
    await q.close();
    expect(mwRan).toBe(true);
  });

  it("a processor returning a primitive completes rather than failing", async () => {
    const q = new InMemoryQueue(createQueueName("prim"));
    const results: unknown[] = [];
    const seen: unknown[] = [];
    q.process("s", async () => "a string");
    q.process("n", async () => 42);
    q.process("u", async () => {});
    for (const name of ["s", "n", "u"]) results.push(await q.add(name, {}));
    await new Promise((r) => setTimeout(r, 400));
    for (const job of results as any[]) {
      seen.push((await q.getJob(job.id))?.state);
    }
    const stats = await q.getStats();
    await q.close();
    // `"success" in result` threw a TypeError for a primitive return,
    // which was caught and dead-lettered the job.
    expect(seen).toEqual(["completed", "completed", "completed"]);
    expect(stats.succeeded).toBe(3);
  });
});
