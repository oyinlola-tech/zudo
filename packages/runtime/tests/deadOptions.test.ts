import { describe, it, expect } from "vitest";

import { createTestRuntime } from "../src/testRuntime/testRuntime.core.js";

describe("declared options are honoured", () => {
  it("startupTimeout bounds a module whose onInitialize never settles", async () => {
    const hang = {
      id: "hang",
      name: "hang",
      onInitialize: () => new Promise<void>(() => {}),
    } as never;

    const rt = createTestRuntime([hang], { startupTimeout: 60 });

    const started = Date.now();
    await expect(rt.start()).rejects.toThrow(/timed out/i);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(rt.state).toBe("failed");

    await rt.stop();
  });

  it("startupTimeout leaves no timer armed on a fast start", async () => {
    const before = (
      process as unknown as { getActiveResourcesInfo(): string[] }
    )
      .getActiveResourcesInfo()
      .filter((r) => r === "Timeout").length;

    const rt = createTestRuntime([], { startupTimeout: 30_000 });
    await rt.start();
    await rt.stop();

    const after = (process as unknown as { getActiveResourcesInfo(): string[] })
      .getActiveResourcesInfo()
      .filter((r) => r === "Timeout").length;

    expect(after).toBeLessThanOrEqual(before);
  });
});
