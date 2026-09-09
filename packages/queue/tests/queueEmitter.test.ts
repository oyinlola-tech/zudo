import { describe, it, expect, vi } from "vitest";

import { createInMemoryQueue } from "../src/inMemoryQueue/index.js";

import { createInMemoryQueueEventEmitter } from "../src/queueEmitter/queueEmitter.core.js";

import {
  createQueueName,
  JobState,
} from "../src/jobTypes/jobTypes.type.js";

describe("Queue Event Emitter", () => {
  it("should emit job:created when a job is added", async () => {
    const emitter = createInMemoryQueueEventEmitter();
    const queue = createInMemoryQueue(createQueueName("test-queue"), {
      eventEmitter: emitter,
    });

    const handler = vi.fn();
    emitter.on("job:created", handler);

    await queue.add("test-job", { userId: "123" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      job: expect.objectContaining({ name: "test-job" }),
    });
  });

  it("should emit job:started when a job starts processing", async () => {
    const emitter = createInMemoryQueueEventEmitter();
    const queue = createInMemoryQueue(createQueueName("test-queue"), {
      eventEmitter: emitter,
      concurrency: 1,
    });

    const handler = vi.fn();
    emitter.on("job:started", handler);

    queue.process("test-job", async () => ({ success: true }));
    await queue.add("test-job", { userId: "123" });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      job: expect.objectContaining({ state: JobState.ACTIVE }),
    });

    await queue.close();
  });

  it("should emit job:completed when a job succeeds", async () => {
    const emitter = createInMemoryQueueEventEmitter();
    const queue = createInMemoryQueue(createQueueName("test-queue"), {
      eventEmitter: emitter,
      concurrency: 1,
    });

    const handler = vi.fn();
    emitter.on("job:completed", handler);

    queue.process("test-job", async () => ({ success: true, data: "result" }));
    await queue.add("test-job", { userId: "123" });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      job: expect.objectContaining({ state: JobState.COMPLETED }),
      result: "result",
    });

    await queue.close();
  });

  it("should emit job:failed when a job fails", async () => {
    const emitter = createInMemoryQueueEventEmitter();
    const queue = createInMemoryQueue(createQueueName("test-queue"), {
      eventEmitter: emitter,
      concurrency: 1,
    });

    const handler = vi.fn();
    emitter.on("job:failed", handler);

    queue.process("test-job", async () => {
      throw new Error("fail");
    });
    await queue.add("test-job", { userId: "123" });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      job: expect.objectContaining({ state: JobState.FAILED }),
      error: expect.any(Error),
    });

    await queue.close();
  });

  it("should emit job:retrying before a retry", async () => {
    const emitter = createInMemoryQueueEventEmitter();
    const queue = createInMemoryQueue(createQueueName("test-queue"), {
      eventEmitter: emitter,
      concurrency: 1,
    });

    const handler = vi.fn();
    emitter.on("job:retrying", handler);

    let attempts = 0;
    queue.process("test-job", async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error("retry");
      }
      return { success: true };
    });

    await queue.add(
      "test-job",
      { userId: "123" },
      {
        attempts: 3,
        backoff: { type: "fixed", delay: 10 },
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      job: expect.objectContaining({ state: JobState.RETRYING }),
      attempt: 1,
    });

    await queue.close();
  });
});
