import { describe, it, expect, vi } from "vitest";

import { PluginManager } from "../src/index.js";
import { createPluginContext } from "../src/pluginIntegration/pluginContext.core.js";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function webPlugin(log: string[], startMs: number) {
  return {
    metadata: { name: "web", version: "1.0.0" },
    async start() {
      await delay(startMs);
      log.push("start:end");
    },
    stop: () => void log.push("stop"),
    dispose: () => void log.push("dispose"),
  };
}

describe("runtime/PLUG-01", () => {
  it("waits for a timed-out start and stops the plugin before disposing it", async () => {
    const log: string[] = [];
    const m = new PluginManager({ hookTimeout: 40 });
    m.register(webPlugin(log, 60));

    await expect(m.start(createPluginContext({ name: "host" }))).rejects.toThrow(/timed out|timeout/i);

    expect(log).toEqual(["start:end", "stop", "dispose"]);
  });

  it("still stops a plugin whose start finishes after the grace period", async () => {
    const log: string[] = [];
    const m = new PluginManager({ hookTimeout: 20 });
    m.register(webPlugin(log, 100));

    await expect(m.start(createPluginContext({ name: "host" }))).rejects.toThrow();
    await delay(150);

    expect(log).toContain("stop");
    expect(log.indexOf("stop")).toBeGreaterThan(log.indexOf("start:end"));
  });
});

describe("runtime/CONV-02", () => {
  it("reports teardown failures through the logger, not console.error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const m = new PluginManager({ logger });
    m.register({
      metadata: { name: "bad", version: "1.0.0" },
      stop: () => {
        throw new Error("close failed");
      },
    });
    const ctx = createPluginContext({ name: "host" });

    await m.start(ctx);
    await m.stop(ctx);
    await delay(0);

    expect(logger.error).toHaveBeenCalledWith(
      'Plugin "bad" failed during teardown.',
      expect.objectContaining({ plugin: "bad" }),
    );
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
