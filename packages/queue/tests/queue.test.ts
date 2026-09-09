import { describe, it, expect } from "vitest";

import { createQueue, isQueue } from "../src/queue/queue.core.js";

import {
  createQueueName,
  JobState,
} from "../src/jobTypes/jobTypes.type.js";

describe("Queue", () => {
  describe("createQueue", () => {
    it("should create a queue", () => {
      const queue = createQueue(createQueueName("test-queue"));

      expect(queue.name).toBe("test-queue");
      expect(queue.isPaused()).toBe(false);
    });

    it("should add a job to the queue", async () => {
      const queue = createQueue(createQueueName("test-queue"));

      const job = await queue.add("test-job", { userId: "123" });

      expect(job.id).toBeDefined();
      expect(job.name).toBe("test-job");
      expect(job.data).toEqual({ userId: "123" });
      expect(job.state).toBe(JobState.WAITING);
    });

    it("should get a job by ID", async () => {
      const queue = createQueue(createQueueName("test-queue"));

      const job = await queue.add("test-job", { userId: "123" });
      const retrievedJob = await queue.getJob(job.id);

      expect(retrievedJob).toEqual(job);
    });

    it("should return null for non-existent job", async () => {
      const queue = createQueue(createQueueName("test-queue"));

      const job = await queue.getJob(createQueueName("non-existent") as any);

      expect(job).toBeNull();
    });

    it("should get queue statistics", async () => {
      const queue = createQueue(createQueueName("test-queue"));

      await queue.add("test-job", { userId: "123" });
      await queue.add("test-job", { userId: "456" });

      const stats = await queue.getStats();

      expect(stats.waiting).toBe(2);
      expect(stats.active).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.delayed).toBe(0);
      expect(stats.retrying).toBe(0);
    });

    it("should pause and resume the queue", async () => {
      const queue = createQueue(createQueueName("test-queue"));

      expect(queue.isPaused()).toBe(false);

      await queue.pause();
      expect(queue.isPaused()).toBe(true);

      await queue.resume();
      expect(queue.isPaused()).toBe(false);
    });

    it("should throw when adding job to paused queue", async () => {
      const queue = createQueue(createQueueName("test-queue"));

      await queue.pause();

      await expect(queue.add("test-job", { userId: "123" })).rejects.toThrow(
        'Queue "test-queue" is paused.',
      );
    });

    it("should close the queue", async () => {
      const queue = createQueue(createQueueName("test-queue"));

      await queue.add("test-job", { userId: "123" });
      await queue.close();

      const stats = await queue.getStats();
      expect(stats.waiting).toBe(0);
    });
  });

  describe("isQueue", () => {
    it("should return true for a valid Queue", () => {
      const queue = createQueue(createQueueName("test-queue"));

      expect(isQueue(queue)).toBe(true);
    });

    it("should return false for a non-Queue object", () => {
      expect(isQueue({})).toBe(false);
      expect(isQueue(null)).toBe(false);
      expect(isQueue(undefined)).toBe(false);
      expect(isQueue("string")).toBe(false);
    });
  });
});
