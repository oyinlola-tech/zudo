/**
 * @zudojs/queue — Round 10 regression tests (context and reporting).
 *
 * One describe block per finding.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, describe, it, expect, vi } from "vitest";

import {
  CONTEXT_METADATA_KEY,
  createInMemoryQueue,
  createQueueName,
  createWorker,
  InMemoryQueueEventEmitter,
} from "../src/index.js";
import type { QueueContextCarrier } from "../src/index.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const tenants = new AsyncLocalStorage<{ readonly tenantId: string }>();
const tenantCarrier: QueueContextCarrier<string> = {
  key: "tenantId",
  capture: () => tenants.getStore()?.tenantId,
  restore: (tenantId, run) => tenants.run({ tenantId }, run),
};

/* ─── cross/X-06: tenant context was dropped at the queue boundary ──────── */

describe("X-06", () => {
  it("restores the enqueuing tenant inside the processor and its middleware", async () => {
    const seen: (string | undefined)[] = [];
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r10-context"),
      {
        pollInterval: 5,
        contextCarriers: [tenantCarrier],
        middleware: [
          async (ctx) => {
            seen.push(`mw:${tenants.getStore()?.tenantId}`);
            return ctx.next();
          },
        ],
      },
    );
    queue.process("job", async () => {
      seen.push(tenants.getStore()?.tenantId);
    });

    const job = await tenants.run({ tenantId: "acme" }, () =>
      queue.add("job", { n: 1 }),
    );
    await queue.add("job", { n: 2 }); // no tenant in scope
    await sleep(100);
    await queue.close();

    expect(job.metadata?.[CONTEXT_METADATA_KEY]).toEqual({ tenantId: "acme" });
    expect(seen).toEqual(["mw:acme", "acme", "mw:undefined", undefined]);
  });

  it("also restores context for jobs run by a Worker", async () => {
    const queue = createInMemoryQueue<{ n: number }>(
      createQueueName("r10-context-worker"),
      { contextCarriers: [tenantCarrier] },
    );
    let seen: string | undefined;
    queue.process("job", async () => {
      seen = tenants.getStore()?.tenantId;
    });
    const worker = createWorker("w", queue, { pollInterval: 5 });
    await worker.start();
    await tenants.run({ tenantId: "globex" }, () => queue.add("job", { n: 1 }));
    await sleep(80);
    await worker.stop();
    await queue.close();
    expect(seen).toBe("globex");
  });
});

/* ─── INF-18: failures went to console.* instead of a logger ─────────────── */

describe("INF-18", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports a throwing listener via process.emitWarning, not the console", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
    const emitter = new InMemoryQueueEventEmitter();
    emitter.on("job:created", () => {
      throw new Error("listener bug");
    });
    emitter.emit("job:created", { job: {} as never });
    await sleep(0);
    expect(consoleError).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("routes worker poll failures to logger.error when one is given", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const errors: string[] = [];
    const queue = createInMemoryQueue<{ n: number }>(createQueueName("r10-log"));
    queue.claimNextJob = async () => {
      throw new Error("store down");
    };
    const worker = createWorker("w", queue, {
      pollInterval: 5,
      logger: { info: () => {}, error: (message) => errors.push(message) },
    });
    await worker.start();
    await sleep(30);
    await worker.stop();
    await queue.close();
    expect(consoleError).not.toHaveBeenCalled();
    expect(errors.length).toBeGreaterThan(0);
  });
});
