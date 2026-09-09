import { describe, it, expect, vi, afterEach } from "vitest";

import { createInMemoryQueue } from "../src/inMemoryQueue/index.js";

import {
  createQueueName,
  JobState,
} from "../src/jobTypes/jobTypes.type.js";

describe("Queue Execution", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("deduplication", () => {
    it("should reject duplicate jobs with the same deduplication key", async () => {
      const queue = createInMemoryQueue(createQueueName("test-queue"));

      await queue.add(
        "send-email",
        { userId: "123" },
        {
          deduplicationKey: "payment:12345",
        },
      );

      await expect(
        queue.add(
          "send-email",
          { userId: "456" },
          {
            deduplicationKey: "payment:12345",
          },
        ),
      ).rejects.toThrow("Duplicate job detected");
    });

    it("should allow jobs with different deduplication keys", async () => {
      const queue = createInMemoryQueue(createQueueName("test-queue"));

      await queue.add(
        "send-email",
        { userId: "123" },
        {
          deduplicationKey: "payment:12345",
        },
      );

      const job = await queue.add(
        "send-email",
        { userId: "456" },
        {
          deduplicationKey: "payment:67890",
        },
      );

      expect(job.id).toBeDefined();
    });
  });

  describe("scheduled jobs", () => {
    it("should create scheduled jobs with delay option", async () => {
      const queue = createInMemoryQueue(createQueueName("test-queue"));

      const job = await queue.add(
        "send-reminder",
        { userId: "123" },
        {
          delay: 60_000,
        },
      );

      expect(job.state).toBe(JobState.SCHEDULED);
      expect(job.scheduledAt).toBeDefined();
    });

    it("should transition scheduled jobs to waiting after delay", async () => {
      vi.useFakeTimers();
      const queue = createInMemoryQueue(createQueueName("test-queue"));

      const job = await queue.add(
        "send-reminder",
        { userId: "123" },
        {
          delay: 100,
        },
      );

      expect(job.state).toBe(JobState.SCHEDULED);

      await vi.advanceTimersByTimeAsync(150);

      const updatedJob = await queue.getJob(job.id);
      expect(updatedJob?.state).toBe(JobState.WAITING);
    });
  });

  describe("priority-based job selection", () => {
    it("should return the highest priority job first", async () => {
      const queue = createInMemoryQueue(createQueueName("test-queue"));

      await queue.add("low", {}, { priority: 10 });
      await queue.add("high", {}, { priority: 100 });
      await queue.add("normal", {}, { priority: 50 });

      const nextJob = await queue.getNextJob();
      expect(nextJob?.name).toBe("high");
    });

    it("should return FIFO order for same priority", async () => {
      const queue = createInMemoryQueue(createQueueName("test-queue"));

      const job1 = await queue.add("first", {}, { priority: 50 });
      const job2 = await queue.add("second", {}, { priority: 50 });

      // Checking only the head passes for a queue that returns the same job
      // forever. Claim it, then assert the second job follows.
      queue.process("first", async () => undefined);
      queue.process("second", async () => undefined);

      expect((await queue.claimNextJob())?.id).toBe(job1.id);
      expect((await queue.claimNextJob())?.id).toBe(job2.id);

      await queue.close();
    });
  });

  describe("job processing", () => {
    it("should process jobs with registered processor", async () => {
      const queue = createInMemoryQueue(createQueueName("test-queue"));
      const processor = vi.fn().mockResolvedValue({ success: true });

      queue.process("test-job", processor);

      await queue.add("test-job", { userId: "123" });

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(processor).toHaveBeenCalledTimes(1);
      expect(processor).toHaveBeenCalledWith(
        expect.objectContaining({ name: "test-job" }),
        expect.any(Object),
      );

      await queue.close();
    });

    it("should retry failed jobs with backoff", async () => {
      const queue = createInMemoryQueue(createQueueName("test-queue"));
      let attempts = 0;
      const processor = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Temporary failure");
        }
        return { success: true };
      });

      queue.process("test-job", processor);

      await queue.add(
        "test-job",
        { userId: "123" },
        {
          attempts: 3,
          backoff: { type: "fixed", delay: 50 },
        },
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(attempts).toBe(3);

      await queue.close();
    });

    it("should move job to dead letter after max attempts", async () => {
      const queue = createInMemoryQueue(createQueueName("test-queue"));
      const processor = vi
        .fn()
        .mockRejectedValue(new Error("Persistent failure"));

      queue.process("test-job", processor);

      await queue.add(
        "test-job",
        { userId: "123" },
        {
          attempts: 2,
          backoff: { type: "fixed", delay: 10 },
        },
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      const stats = await queue.getStats();
      expect(stats.failed).toBe(1);

      await queue.close();
    });
  });
});
