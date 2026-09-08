import { describe, it, expect } from "vitest";

import { PluginManager } from "../src/pluginManager/pluginManager.core.js";
import { createPluginContext } from "../src/pluginIntegration/pluginContext.core.js";

const ctx = () => createPluginContext({ name: "host" });

describe("declared options are honoured", () => {
  it("hookTimeout bounds a hanging lifecycle hook", async () => {
    const m = new PluginManager({ hookTimeout: 50 });
    m.register({
      metadata: { name: "hang" },
      start: () => new Promise<void>(() => {}),
    });

    const started = Date.now();
    await expect(m.start(ctx())).rejects.toThrow(/timed out|timeout/i);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("hooks are unbounded by default", async () => {
    const m = new PluginManager();
    m.register({
      metadata: { name: "quick" },
      async start() {
        await new Promise((r) => setTimeout(r, 30));
      },
    });
    await expect(m.start(ctx())).resolves.toBeUndefined();
  });

  it("allowedCapabilities rejects an ungranted capability", () => {
    const m = new PluginManager({ allowedCapabilities: ["http"] });

    expect(() =>
      m.register({ metadata: { name: "ok", capabilities: ["http"] } }),
    ).not.toThrow();

    expect(() =>
      m.register({ metadata: { name: "bad", capabilities: ["filesystem"] } }),
    ).toThrow(/not granted/i);
  });

  it("capabilities are unrestricted when no list is configured", () => {
    const m = new PluginManager();
    expect(() =>
      m.register({ metadata: { name: "any", capabilities: ["anything"] } }),
    ).not.toThrow();
  });
});
