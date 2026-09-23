import { describe, expect, it, vi } from "vitest";

import { createTestQueue } from "../src/index.js";

describe("createTestQueue().queue.onJobReady", () => {
  it("forwards to the in-memory queue so a Worker is woken when a job is added", async () => {
    const { queue } = createTestQueue<{ n: number }>("jobs");
    const listener = vi.fn();
    const unsubscribe = queue.onJobReady?.(listener);
    await queue.add("work", { n: 1 });
    expect(listener).toHaveBeenCalled();
    unsubscribe?.();
    await queue.close();
  });
});
