import { describe, it, expect } from "vitest";

import { createWorker, isWorker } from "../src/worker/worker.core.js";

import { createQueueName, WorkerState } from "../src/jobTypes/jobTypes.type.js";

import { createInMemoryQueue } from "../src/inMemoryQueue/index.js";

describe("Worker", () => {
  describe("createWorker", () => {
    it("should create a worker", () => {
      const queue = createInMemoryQueue(createQueueName("test-queue"));
      const worker = createWorker("worker-1", queue);

      expect(worker.id).toBe("worker-1");
      expect(worker.queueName).toBe("test-queue");
      expect(worker.state).toBe(WorkerState.CREATED);
      expect(worker.isRunning()).toBe(false);
    });

    it("should create a worker with options", () => {
      const queue = createInMemoryQueue(createQueueName("test-queue"));
      const worker = createWorker("worker-1", queue, {
        concurrency: 5,
        pollInterval: 2000,
      });

      expect(worker.id).toBe("worker-1");
      const stats = worker.getStats();
      expect(stats.concurrency).toBe(5);
    });

    it("should start the worker", async () => {
      const queue = createInMemoryQueue(createQueueName("test-queue"));
      const worker = createWorker("worker-1", queue);

      await worker.start();

      expect(worker.state).toBe(WorkerState.RUNNING);
      expect(worker.isRunning()).toBe(true);
    });

    it("should stop the worker", async () => {
      const queue = createInMemoryQueue(createQueueName("test-queue"));
      const worker = createWorker("worker-1", queue);

      await worker.start();
      await worker.stop();

      expect(worker.state).toBe(WorkerState.STOPPED);
      expect(worker.isRunning()).toBe(false);
    });

    it("should force stop the worker", async () => {
      const queue = createInMemoryQueue(createQueueName("test-queue"));
      const worker = createWorker("worker-1", queue);

      await worker.start();
      await worker.forceStop();

      expect(worker.state).toBe(WorkerState.STOPPED);
      expect(worker.isRunning()).toBe(false);
    });

    it("should throw when starting from non-created state", async () => {
      const queue = createInMemoryQueue(createQueueName("test-queue"));
      const worker = createWorker("worker-1", queue);

      await worker.start();

      await expect(worker.start()).rejects.toThrow(
        'Worker "worker-1" cannot start from state "running".',
      );
    });

    it("should get worker stats", async () => {
      const queue = createInMemoryQueue(createQueueName("test-queue"));
      const worker = createWorker("worker-1", queue, {
        concurrency: 3,
      });

      const stats = worker.getStats();

      expect(stats.processed).toBe(0);
      expect(stats.succeeded).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.concurrency).toBe(3);
      expect(stats.state).toBe(WorkerState.CREATED);
    });
  });

  describe("isWorker", () => {
    it("should return true for a valid Worker", () => {
      const queue = createInMemoryQueue(createQueueName("test-queue"));
      const worker = createWorker("worker-1", queue);

      expect(isWorker(worker)).toBe(true);
    });

    it("should return false for a non-Worker object", () => {
      expect(isWorker({})).toBe(false);
      expect(isWorker(null)).toBe(false);
      expect(isWorker(undefined)).toBe(false);
      expect(isWorker("string")).toBe(false);
    });
  });
});
