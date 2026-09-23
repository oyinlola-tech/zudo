/**
 * @zudojs/plugins — post-release regressions.
 *
 * `PluginDependency.optional` was declared but ignored: only the separate
 * `optionalDependencies` field was honoured, so
 * `dependencies: [{ name: "metrics", optional: true }]` with no "metrics"
 * plugin made `start()` throw `PluginDependencyError`.
 */

import { describe, expect, it } from "vitest";

import {
  DependencyResolver,
  PluginDependencyError,
  PluginDependencyVersionError,
  PluginManager,
  createPluginContext,
} from "../src/index.js";

const host = () => createPluginContext({ name: "host" });

describe("dependencies entries marked optional: true", () => {
  it("start without the optional plugin registered", async () => {
    const started: string[] = [];
    const manager = new PluginManager();
    manager.register({
      metadata: { name: "api" },
      dependencies: [{ name: "metrics", optional: true }],
      start: () => {
        started.push("api");
      },
    });

    await expect(manager.start(host())).resolves.toBeUndefined();
    expect(started).toEqual(["api"]);
  });

  it("start after the optional plugin when it is registered", async () => {
    const started: string[] = [];
    const manager = new PluginManager();
    manager.register({
      metadata: { name: "api" },
      dependencies: [{ name: "metrics", optional: true }],
      start: () => {
        started.push("api");
      },
    });
    manager.register({
      metadata: { name: "metrics" },
      start: () => {
        started.push("metrics");
      },
    });

    await manager.start(host());
    expect(started).toEqual(["metrics", "api"]);
  });

  it("still enforces a version constraint when the plugin is present", async () => {
    const manager = new PluginManager();
    manager.register({ metadata: { name: "metrics", version: "1.0.0" } });
    manager.register({
      metadata: { name: "api" },
      dependencies: [{ name: "metrics", version: "^2.0.0", optional: true }],
    });

    await expect(manager.start(host())).rejects.toBeInstanceOf(
      PluginDependencyVersionError,
    );
  });

  it("still rejects a missing required dependency beside an optional one", async () => {
    const manager = new PluginManager();
    manager.register({
      metadata: { name: "api" },
      dependencies: [
        { name: "metrics", optional: true },
        { name: "db" },
        { name: "cache", optional: false },
      ],
    });

    await expect(manager.start(host())).rejects.toBeInstanceOf(
      PluginDependencyError,
    );
  });

  it("is not reported missing by the resolver", () => {
    const resolution = new DependencyResolver().resolve(
      new Map([["api", { dependencies: [{ name: "metrics", optional: true }] }]]),
    );

    expect(resolution.missing).toEqual([]);
    expect(resolution.missingDetails).toEqual([]);
    expect(resolution.ordered).toEqual(["api"]);
  });
});
