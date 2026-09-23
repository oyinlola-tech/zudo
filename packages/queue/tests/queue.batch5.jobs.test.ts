/**
 * @zudojs/queue — batch 5: payloads, ordering, attempts and events.
 *
 * Bugs reproduced by lesson writers against the published package.
 */

import { describe, it, expect, vi } from "vitest";

import {
  createFixedBackoff,
  createInMemoryQueue,
  createJsonSerializer,
  createQueueName,
  JobPriorityLevels,
  JsonSerializer,
  PassthroughSerializer,
} from "../src/index.js";
import type { Job, JobContext } from "../src/index.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("the default serializer round-trips Date (and other built-ins)", () => {
  it("hands the processor a Date for a field typed as Date", async () => {
    const queue = createInMemoryQueue<{ d: Date }>(createQueueName("dates"));
    let received: unknown;
    queue.process("d", async (job) => {
      received = job.data.d;
      return job.data.d.getTime();
    });

    const when = new Date("2026-01-02T03:04:05.000Z");
    const job = await queue.add("d", { d: when });

    expect(job.data.d).toBeInstanceOf(Date);
    await vi.waitFor(() => expect(received).toBeInstanceOf(Date));
    expect((received as Date).toISOString()).toBe(when.toISOString());
    await queue.close();
  });

  it("round-trips BigInt, Map and Set instead of rejecting or flattening them", async () => {
    const queue = createInMemoryQueue<{
      n: bigint;
      m: Map<string, number>;
      s: Set<string>;
    }>(createQueueName("builtins"));

    const job = await queue.add("x", {
      n: 10n,
      m: new Map([["a", 1]]),
      s: new Set(["b"]),
    });

    expect(job.data.n).toBe(10n);
    expect(job.data.m.get("a")).toBe(1);
    expect(job.data.s.has("b")).toBe(true);
    await queue.close();
  });

  it("keeps a copy: later caller mutation does not reach the stored payload", async () => {
    const queue = createInMemoryQueue<{ d: Date }>(createQueueName("copy"));
    const when = new Date(0);
    const job = await queue.add("d", { d: when });
    when.setTime(1_000);
    expect(job.data.d.getTime()).toBe(0);
    await queue.close();
  });

  it("JsonSerializer and createJsonSerializer() preserve types; preserveTypes: false opts out", () => {
    const value = { d: new Date(0) };
    expect(
      JsonSerializer.deserialize<typeof value>(JsonSerializer.serialize(value))
        .d,
    ).toBeInstanceOf(Date);

    const typed = createJsonSerializer();
    expect(
      typed.deserialize<typeof value>(typed.serialize(value)).d,
    ).toBeInstanceOf(Date);

    const plain = createJsonSerializer({ preserveTypes: false });
    expect(plain.serialize(value)).toBe('{"d":"1970-01-01T00:00:00.000Z"}');
  });
});

describe("PassthroughSerializer passes payloads through unchanged", () => {
  it("stores the payload by reference in the in-memory queue", async () => {
    class Money {
      constructor(readonly cents: number) {}
    }
    const queue = createInMemoryQueue<{ price: Money }>(
      createQueueName("passthrough"),
      { serializer: PassthroughSerializer },
    );

    const payload = { price: new Money(250) };
    const job = await queue.add("x", payload);

    expect(job.data).toBe(payload);
    expect(job.data.price).toBeInstanceOf(Money);
    await queue.close();
  });

  it("returns a string payload untouched when used standalone", () => {
    expect(PassthroughSerializer.serialize("raw")).toBe("raw");
    expect(PassthroughSerializer.passthrough).toBe(true);
  });
});

describe("a delayed job is ordered by when it became runnable", () => {
  it("does not jump ahead of older ready jobs once it is due", async () => {
    const queue = createInMemoryQueue<string>(createQueueName("order"), {
      autoProcess: false,
    });
    queue.process("x", async () => {});

    await queue.add("x", "delayed", { delay: 40 });
    await sleep(10);
    await queue.add("x", "ready-1");
    await queue.add("x", "ready-2");
    await sleep(60);

    const order: string[] = [];
    for (let i = 0; i < 3; i++) {
      const job = await queue.claimNextJob();
      order.push(job!.data);
    }

    expect(order).toEqual(["ready-1", "ready-2", "delayed"]);
    await queue.close();
  });

  it("still lets priority win: a due high-priority job goes first", async () => {
    const queue = createInMemoryQueue<string>(createQueueName("priority"), {
      autoProcess: false,
    });
    queue.process("x", async () => {});

    await queue.add("x", "urgent", {
      delay: 20,
      priority: JobPriorityLevels.HIGH,
    });
    await queue.add("x", "normal");
    await sleep(40);

    expect((await queue.claimNextJob())?.data).toBe("urgent");
    await queue.close();
  });
});

describe("attempt numbering", () => {
  it("keeps job.attempt 0-based and adds a 1-based context.attemptNumber", async () => {
    const queue = createInMemoryQueue<number>(createQueueName("attempts"));
    const seen: Array<[number, number]> = [];
    queue.process(
      "x",
      async (job: Job<number>, context: JobContext<number>) => {
        seen.push([job.attempt, context.attemptNumber]);
        if (context.attemptNumber < 3) throw new Error("again");
      },
    );

    await queue.add("x", 1, { attempts: 3, backoff: createFixedBackoff(5) });
    await vi.waitFor(() => expect(seen).toHaveLength(3));

    expect(seen).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
    await queue.close();
  });
});

describe("queue.events works without an eventEmitter option", () => {
  it("delivers job lifecycle events from a default emitter", async () => {
    const queue = createInMemoryQueue<number>(createQueueName("events"));
    const events: string[] = [];
    queue.events?.on("job:created", () => events.push("created"));
    queue.events?.on("job:completed", () => events.push("completed"));
    queue.process("x", async () => {});

    await queue.add("x", 1);
    await vi.waitFor(() => expect(events).toContain("completed"));

    expect(events).toEqual(["created", "completed"]);
    await queue.close();
  });
});
