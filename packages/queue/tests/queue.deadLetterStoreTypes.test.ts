import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  createInMemoryDeadLetterStore,
  createInMemoryQueue,
  createQueue,
  createQueueManager,
  createQueueName,
  type DeadLetterJob,
  type DeadLetterStore,
  type Queue,
  type QueueOptions,
} from "../src/index.js";

/*
 * `QueueOptions.deadLetterStore` was typed `DeadLetterStore<never>`, so the
 * store `createInMemoryDeadLetterStore()` returns (`DeadLetterStore<unknown>`)
 * was rejected with TS2322 and the docs had to annotate `<never>`. These
 * assignments are checked by `pnpm typecheck` (tsconfig.test.json); none of
 * them may need a cast or a type argument.
 */

interface Email {
  readonly to: string;
}

describe("QueueOptions.deadLetterStore typing", () => {
  it("accepts a default-typed store for an untyped queue", async () => {
    const store = createInMemoryDeadLetterStore({ maxEntries: 50 });
    const queue = createInMemoryQueue(createQueueName("dlq-types-default"), {
      pollInterval: 5,
      defaultJobOptions: { attempts: 1 },
      deadLetterStore: store,
    });

    expectTypeOf(queue).toEqualTypeOf<Queue<unknown>>();

    queue.process("job", async () => {
      throw new Error("always fails");
    });
    await queue.add("job", { n: 1 });

    await vi.waitFor(async () => expect(await store.getAll()).toHaveLength(1), {
      timeout: 2000,
    });

    await queue.close();
  });

  it("accepts a store typed for the queue's payload", async () => {
    const store = createInMemoryDeadLetterStore<Email>();
    const queue = createInMemoryQueue<Email>(createQueueName("dlq-types-t"), {
      pollInterval: 5,
      defaultJobOptions: { attempts: 1 },
      deadLetterStore: store,
    });

    queue.process("send", async () => {
      throw new Error("smtp down");
    });
    await queue.add("send", { to: "ada@example.com" });

    await vi.waitFor(async () => expect(await store.getAll()).toHaveLength(1), {
      timeout: 2000,
    });

    const [dead] = await queue.getDeadLetterJobs();
    expectTypeOf(dead!).toEqualTypeOf<DeadLetterJob<Email>>();
    expect(dead!.job.data).toEqual({ to: "ada@example.com" });

    await queue.close();
  });

  it("accepts either store through every queue factory and a QueueOptions value", () => {
    const untyped = createInMemoryDeadLetterStore();
    const options: QueueOptions = {
      deadLetterStore: createInMemoryDeadLetterStore<Email>(),
      autoProcess: false,
    };

    const queues = [
      createInMemoryQueue<Email>(createQueueName("dlq-types-inline"), {
        deadLetterStore: createInMemoryDeadLetterStore(),
        autoProcess: false,
      }),
      createInMemoryQueue<Email>(createQueueName("dlq-types-untyped"), {
        deadLetterStore: untyped,
        autoProcess: false,
      }),
      createQueue<Email>(createQueueName("dlq-types-legacy"), options),
      createQueueManager().getQueue<Email>(createQueueName("dlq-types-mgr"), {
        deadLetterStore: untyped,
        autoProcess: false,
      }),
    ];

    expectTypeOf(queues).toEqualTypeOf<Queue<Email>[]>();
    expectTypeOf(options.deadLetterStore).toExtend<
      DeadLetterStore<unknown> | undefined
    >();
  });

  it("keeps the 1.4.0 `<never>` workaround compiling without narrowing the queue", () => {
    const store = createInMemoryDeadLetterStore<never>();
    const queue = createInMemoryQueue(createQueueName("dlq-types-never"), {
      deadLetterStore: store,
      autoProcess: false,
    });

    expectTypeOf(queue).toEqualTypeOf<Queue<unknown>>();
  });
});
