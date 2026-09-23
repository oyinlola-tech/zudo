/**
 * @zudojs/queue — batch 5: polling, waking and process lifetime.
 *
 * Bugs reproduced by lesson writers against the published package.
 */

import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect, vi } from "vitest";

import {
  createInMemoryQueue,
  createQueueName,
  createWorker,
  InMemoryQueue,
} from "../src/index.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const TSX = fileURLToPath(
  new URL("../../../node_modules/.bin/tsx", import.meta.url),
);
const ENTRY = fileURLToPath(new URL("../src/index.ts", import.meta.url));

/** Runs a TypeScript module in a fresh process and reports how it ended. */
function runScript(
  body: string,
): Promise<{ readonly code: number | null; readonly stdout: string }> {
  const dir = mkdtempSync(join(tmpdir(), "zudo-queue-"));
  const file = join(dir, "script.mts");
  const prelude = `import * as lib from ${JSON.stringify(ENTRY)};\nconst name = lib.createQueueName("q");\n`;
  writeFileSync(file, prelude + body);
  return new Promise((resolve) => {
    execFile(TSX, [file], { timeout: 20_000 }, (error, stdout) => {
      resolve({
        code: error ? ((error as { code?: number }).code ?? 1) : 0,
        stdout,
      });
    });
  });
}

describe("pollInterval is honoured and add() wakes the poller", () => {
  it("runs 40 instant jobs at concurrency 1 well under the old ~2 s", async () => {
    const queue = createInMemoryQueue<number>(createQueueName("fast"));
    let done = 0;
    queue.process("n", async () => {
      done += 1;
    });

    const started = performance.now();
    for (let i = 0; i < 40; i++) await queue.add("n", i);
    await vi.waitFor(() => expect(done).toBe(40), { timeout: 5_000 });

    expect(performance.now() - started).toBeLessThan(600);
    await queue.close();
  });

  it("picks up a job added after the poller backed off while idle", async () => {
    const queue = createInMemoryQueue<number>(createQueueName("idle"));
    let ranAt = 0;
    queue.process("n", async () => {
      ranAt = performance.now();
    });

    await sleep(1_500);
    const addedAt = performance.now();
    await queue.add("n", 1);
    await vi.waitFor(() => expect(ranAt).toBeGreaterThan(0), {
      timeout: 5_000,
    });

    expect(ranAt - addedAt).toBeLessThan(100);
    await queue.close();
  });

  it("keeps polling at pollInterval instead of backing off", async () => {
    const queue = new InMemoryQueue<number>(createQueueName("interval"), {
      pollInterval: 30,
    });
    queue.process("n", async () => {});
    const calls: number[] = [];
    const claim = queue.claimNextJob.bind(queue);
    vi.spyOn(queue, "claimNextJob").mockImplementation(async () => {
      calls.push(performance.now());
      return claim();
    });

    await sleep(1_200);
    await queue.close();

    const late = calls.filter((at) => at - calls[0]! > 800);
    const gaps = late.slice(1).map((at, i) => at - late[i]!);
    expect(gaps.length).toBeGreaterThan(3);
    expect(Math.max(...gaps)).toBeLessThan(100);
  });

  it("wakes an idle worker as soon as a job is added", async () => {
    const queue = createInMemoryQueue<number>(createQueueName("worker-wake"));
    let ranAt = 0;
    queue.process("n", async () => {
      ranAt = performance.now();
    });
    const worker = createWorker("w", queue, { pollInterval: 2_000 });
    await worker.start();

    await sleep(50);
    const addedAt = performance.now();
    await queue.add("n", 1);
    await vi.waitFor(() => expect(ranAt).toBeGreaterThan(0), {
      timeout: 5_000,
    });

    expect(ranAt - addedAt).toBeLessThan(100);
    await worker.stop();
    await queue.close();
  });
});

describe("pending work keeps the process alive", () => {
  it("runs a job in a script that only adds it", async () => {
    const result = await runScript(`
      const queue = lib.createInMemoryQueue(name);
      queue.process("say", async (job) => console.log("ran", job.data));
      await queue.add("say", 1);
    `);
    expect(result).toEqual({ code: 0, stdout: "ran 1\n" });
  });

  it("runs a delayed job and a retried job before exiting", async () => {
    const result = await runScript(`
      const queue = lib.createInMemoryQueue(name);
      let tries = 0;
      queue.process("say", async (job) => {
        tries += 1;
        if (tries === 1) throw new Error("once");
        console.log("ran", job.data, tries);
      });
      await queue.add("say", 2, {
        delay: 150,
        attempts: 2,
        backoff: { type: "fixed", delay: 150 },
      });
    `);
    expect(result).toEqual({ code: 0, stdout: "ran 2 2\n" });
  });

  it("keeps a started worker alive until it is stopped", async () => {
    const result = await runScript(`
      const queue = lib.createInMemoryQueue(name);
      const worker = lib.createWorker("w", queue);
      queue.process("say", async (job) => {
        console.log("ran", job.data);
        setTimeout(() => void worker.stop(), 0);
      });
      await worker.start();
      setTimeout(() => void queue.add("say", 3), 200);
    `);
    expect(result).toEqual({ code: 0, stdout: "ran 3\n" });
  });

  it("exits promptly when the queue is idle or has only unconsumable work", async () => {
    const started = performance.now();
    const result = await runScript(`
      const queue = lib.createInMemoryQueue(name);
      queue.process("say", async () => {});
      await queue.add("nobody-handles-this", 1);
      console.log("done");
    `);
    expect(result).toEqual({ code: 0, stdout: "done\n" });
    expect(performance.now() - started).toBeLessThan(10_000);
  });

  it("releases the process on close() even with delayed work pending", async () => {
    const result = await runScript(`
      const queue = lib.createInMemoryQueue(name);
      queue.process("say", async () => console.log("should not run"));
      await queue.add("say", 1, { delay: 60_000 });
      await queue.close();
      console.log("closed");
    `);
    expect(result).toEqual({ code: 0, stdout: "closed\n" });
  });

  it("keepAlive: false restores the unreferenced timers", async () => {
    const result = await runScript(`
      const queue = lib.createInMemoryQueue(name, { keepAlive: false });
      queue.process("say", async () => console.log("should not run"));
      await queue.add("say", 1, { delay: 60_000 });
    `);
    expect(result).toEqual({ code: 0, stdout: "" });
  });
});
