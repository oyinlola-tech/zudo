/**
 * @zudojs/plugins — Round 9 regression tests.
 */

import { describe, expect, it } from "vitest";
import {
  PluginManager,
  PluginStateError,
  compareVersions,
  createPluginContext,
  parseVersion,
  satisfiesVersion,
} from "../src/index.js";

const ctx = () => createPluginContext({ name: "@acme/host" });

describe("PLUGINS-R9-01: start() refuses to run over disposed plugins", () => {
  it("throws PluginStateError on start() after stop() instead of starting nothing", async () => {
    let starts = 0;
    const manager = new PluginManager();
    manager.register({
      metadata: { name: "p" },
      start() {
        starts += 1;
      },
    });

    await manager.start(ctx());
    await manager.stop(ctx());

    const error = await manager.start(ctx()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PluginStateError);
    expect(starts).toBe(1);
  });

  it("does not start a registered dependent on top of dependencies disposed by rollback", async () => {
    const calls: string[] = [];
    const manager = new PluginManager({ onError: () => {} });
    let fail = true;

    manager.register({
      metadata: { name: "a" },
      start() {
        calls.push("a.start");
      },
    });
    manager.register({
      metadata: { name: "b" },
      dependencies: [{ name: "a" }],
      install() {
        if (fail) throw new Error("b install fails");
      },
    });
    manager.register({
      metadata: { name: "c" },
      dependencies: [{ name: "b" }],
      start() {
        calls.push("c.start");
      },
    });

    await expect(manager.start(ctx())).rejects.toThrow("b install fails");
    fail = false;

    await expect(manager.start(ctx())).rejects.toBeInstanceOf(
      PluginStateError,
    );
    expect(calls).toEqual([]);
    expect(manager.diagnostics().plugins.find((p) => p.plugin.name === "c")?.state).toBe(
      "registered",
    );
  });

  it("starts again once the disposed plugins are re-registered", async () => {
    let starts = 0;
    const manager = new PluginManager();
    const plugin = {
      metadata: { name: "p" },
      start() {
        starts += 1;
      },
    };

    manager.register(plugin);
    await manager.start(ctx());
    await manager.stop(ctx());

    expect(manager.unregister("p")).toBe(true);
    manager.register(plugin);
    await manager.start(ctx());

    expect(starts).toBe(2);
    await manager.stop(ctx());
  });
});

describe("PLUGINS-R9-02: prerelease versions compare per the semver spec", () => {
  const v = (s: string) => parseVersion(s)!;

  it("compares numeric identifiers numerically", () => {
    expect(compareVersions(v("1.0.0-alpha.10"), v("1.0.0-alpha.9"))).toBeGreaterThan(0);
    expect(compareVersions(v("1.0.0-alpha.2"), v("1.0.0-alpha.10"))).toBeLessThan(0);
  });

  it("ranks numeric identifiers below alphanumeric ones and shorter lists lower", () => {
    expect(compareVersions(v("1.0.0-1"), v("1.0.0-alpha"))).toBeLessThan(0);
    expect(compareVersions(v("1.0.0-alpha"), v("1.0.0-alpha.1"))).toBeLessThan(0);
    expect(compareVersions(v("1.0.0-alpha.beta"), v("1.0.0-beta"))).toBeLessThan(0);
    expect(compareVersions(v("1.0.0-rc.1"), v("1.0.0"))).toBeLessThan(0);
  });

  it("is honoured by range checks", () => {
    expect(satisfiesVersion("1.0.0-alpha.10", ">=1.0.0-alpha.9")).toBe(true);
    expect(satisfiesVersion("1.0.0-alpha.9", "<1.0.0-alpha.10")).toBe(true);
  });
});
