import { describe, it, expect } from "vitest";
import { PluginManager } from "../src/pluginManager/pluginManager.core.js";
import { createPluginContext } from "../src/pluginIntegration/pluginContext.core.js";
import { DependencyResolver } from "../src/pluginDependencies/dependencyResolver.core.js";
import {
  satisfiesVersion,
  assertDependencyVersions,
  PluginDependencyVersionError,
} from "../src/pluginDependencies/versionCheck.core.js";
import { PluginDependencyError } from "@zudojs/errors";

const ctx = () => createPluginContext({ name: "host" });

describe("regressions: audit round 7", () => {
  it("P-01 context disposables run on shutdown, in reverse order", async () => {
    const order: string[] = [];
    const m = new PluginManager();
    m.register({
      metadata: { name: "p" },
      install(c) {
        c.onDispose(() => {
          order.push("first");
        });
        c.registerDisposable({
          dispose: () => {
            order.push("second");
          },
        });
      },
    });
    await m.start(ctx());
    await m.stop(ctx());
    expect(order).toEqual(["second", "first"]);
  });

  it("P-01 plugin signal aborts on shutdown", async () => {
    let aborted = false;
    const m = new PluginManager();
    m.register({
      metadata: { name: "p" },
      install(c) {
        c.signal.addEventListener("abort", () => {
          aborted = true;
        });
      },
    });
    await m.start(ctx());
    await m.stop(ctx());
    expect(aborted).toBe(true);
  });

  it("P-02 shutdown follows reverse dependency order", async () => {
    const order: string[] = [];
    const m = new PluginManager();
    m.register({
      metadata: { name: "b" },
      dependencies: [{ name: "a" }],
      stop() {
        order.push("b");
      },
    });
    m.register({
      metadata: { name: "a" },
      stop() {
        order.push("a");
      },
    });
    await m.start(ctx());
    await m.stop(ctx());
    expect(order).toEqual(["b", "a"]);
  });

  it("P-03 aborted startup rolls back and disposes what came up", async () => {
    let disposed = false;
    const m = new PluginManager();
    m.register({
      metadata: { name: "aaa" },
      install() {},
      dispose() {
        disposed = true;
      },
    });
    m.register({
      metadata: { name: "zzz" },
      install() {
        throw new Error("boom");
      },
    });
    await expect(m.start(ctx())).rejects.toThrow("boom");
    expect(disposed).toBe(true);
    expect(m.diagnostics().failed).toBe(1);
  });

  it("P-03 shutdown errors are reported, not swallowed", async () => {
    const seen: string[] = [];
    const m = new PluginManager({ onError: (_e, name) => seen.push(name) });
    m.register({
      metadata: { name: "p" },
      stop() {
        throw new Error("no");
      },
    });
    m.register({ metadata: { name: "q" }, stop() {} });
    await m.start(ctx());
    await m.stop(ctx());
    expect(seen).toContain("p");
  });

  it("P-04 present optional dependencies order startup", async () => {
    const order: string[] = [];
    const m = new PluginManager();
    m.register({
      metadata: { name: "consumer" },
      optionalDependencies: [{ name: "provider" }],
      start() {
        order.push("consumer");
      },
    });
    m.register({
      metadata: { name: "provider" },
      start() {
        order.push("provider");
      },
    });
    await m.start(ctx());
    expect(order).toEqual(["provider", "consumer"]);
  });

  it("P-04 absent optional dependencies are not errors", async () => {
    const m = new PluginManager();
    m.register({
      metadata: { name: "consumer" },
      optionalDependencies: [{ name: "nope" }],
    });
    await expect(m.start(ctx())).resolves.toBeUndefined();
  });

  it("P-05 version constraints are enforced", () => {
    expect(satisfiesVersion("1.2.3", "^1.0.0")).toBe(true);
    expect(satisfiesVersion("2.0.0", "^1.0.0")).toBe(false);
    expect(satisfiesVersion("1.2.9", "~1.2.0")).toBe(true);
    expect(satisfiesVersion("1.3.0", "~1.2.0")).toBe(false);
    expect(satisfiesVersion("1.2.3", ">=1.0.0")).toBe(true);
    expect(satisfiesVersion("0.2.5", "^0.2.0")).toBe(true);
    expect(satisfiesVersion("0.3.0", "^0.2.0")).toBe(false);
    expect(satisfiesVersion("1.2.3", "*")).toBe(true);
    expect(satisfiesVersion("1.2.3", "garbage")).toBeUndefined();
  });

  it("P-05 an unsatisfied version blocks startup", async () => {
    const m = new PluginManager();
    m.register({
      metadata: { name: "app" },
      dependencies: [{ name: "lib", version: "^2.0.0" }],
    });
    m.register({ metadata: { name: "lib", version: "1.0.0" } });
    await expect(m.start(ctx())).rejects.toThrow(/lib/);
  });

  it("P-06 duplicate registration keeps its error identity", () => {
    const m = new PluginManager();
    m.register({ metadata: { name: "p" } });
    expect(() => m.register({ metadata: { name: "p" } })).toThrow(
      /already registered/i,
    );
  });

  it("P-06 a missing dependency names the plugin that needed it", () => {
    const r = new DependencyResolver().resolve(
      new Map([["app", { dependencies: [{ name: "missing" }] }]]),
    );
    expect(r.missingDetails[0]).toEqual({
      plugin: "app",
      dependency: "missing",
    });
  });

  it("P-07 cycles are detected without recursion overflow", () => {
    const r = new DependencyResolver().resolve(
      new Map([
        ["a", { dependencies: [{ name: "b" }] }],
        ["b", { dependencies: [{ name: "a" }] }],
      ]),
    );
    expect(r.cycles.length).toBeGreaterThan(0);

    const deep = new Map<string, any>();
    for (let i = 0; i < 20000; i++)
      deep.set(`p${i}`, { dependencies: i > 0 ? [{ name: `p${i - 1}` }] : [] });
    expect(() => new DependencyResolver().resolve(deep)).not.toThrow();
  });

  it("P-07 disposables do not run twice", async () => {
    let count = 0;
    const m = new PluginManager();
    m.register({
      metadata: { name: "p" },
      install(c) {
        c.onDispose(() => {
          count++;
        });
      },
    });
    await m.start(ctx());
    await m.stop(ctx());
    await m.stop(ctx());
    expect(count).toBe(1);
  });

  it("restart after stop works", async () => {
    let starts = 0;
    const m = new PluginManager();
    m.register({
      metadata: { name: "p" },
      start() {
        starts++;
      },
      stop() {},
    });
    await m.start(ctx());
    // stop only; dispose is what makes it terminal, so re-start from "stopped"
    await m["lifecycle"].stop(m["registry"].get("p")!, ctx());
    await m.start(ctx());
    expect(starts).toBe(2);
  });
});

describe("regressions: audit round 9", () => {
  it("assertDependencyVersions names the requirer, the target and the actual version", () => {
    const plugins = new Map([
      ["a", { metadata: { name: "a" }, dependencies: [{ name: "b", version: "^2.0.0" }] }],
      ["b", { metadata: { name: "b", version: "1.4.0" } }],
    ]);

    expect(() => assertDependencyVersions(plugins)).toThrow(
      /requires "b\@\^2\.0\.0", but version 1\.4\.0 is registered/,
    );
  });

  it("PluginManager.start enforces declared versions by default", async () => {
    const manager = new PluginManager();
    manager.register({ metadata: { name: "b", version: "1.4.0" } });
    manager.register({
      metadata: { name: "a" },
      dependencies: [{ name: "b", version: "^2.0.0" }],
    });

    await expect(manager.start(ctx())).rejects.toThrow(/1\.4\.0 is registered/);
  });

  it("a version mismatch is not reported as a missing plugin", () => {
    const plugins = new Map([
      ["a", { metadata: { name: "a" }, dependencies: [{ name: "b", version: "^2.0.0" }] }],
      ["b", { metadata: { name: "b", version: "1.4.0" } }],
    ]);

    let caught: unknown;
    try {
      assertDependencyVersions(plugins);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PluginDependencyVersionError);
    // Existing handlers that catch the base class still match.
    expect(caught).toBeInstanceOf(PluginDependencyError);

    const error = caught as PluginDependencyVersionError;
    expect(error.requiredBy).toBe("a");
    expect(error.dependencyName).toBe("b");
    expect(error.required).toBe("^2.0.0");
    expect(error.actual).toBe("1.4.0");
    // The old message claimed "b" was not registered, which was false.
    expect(error.message).not.toMatch(/not registered/);
    expect(error.message).toMatch(/checkVersions: false/);
  });

  it("an unparseable range says which forms are supported", () => {
    const plugins = new Map([
      ["a", { metadata: { name: "a" }, dependencies: [{ name: "b", version: "not-a-range" }] }],
      ["b", { metadata: { name: "b", version: "1.4.0" } }],
    ]);

    expect(() => assertDependencyVersions(plugins)).toThrow(
      /Supported forms are an exact version/,
    );
  });

  it("a dependency with no declared version says so", () => {
    const plugins = new Map([
      ["a", { metadata: { name: "a" }, dependencies: [{ name: "b", version: "^1.0.0" }] }],
      ["b", { metadata: { name: "b" } }],
    ]);

    expect(() => assertDependencyVersions(plugins)).toThrow(
      /declares no version/,
    );
  });

  it("checkVersions:false skips the check it says it skips", async () => {
    const manager = new PluginManager({ checkVersions: false });
    manager.register({ metadata: { name: "b", version: "1.4.0" } });
    manager.register({
      metadata: { name: "a" },
      dependencies: [{ name: "b", version: "^2.0.0" }],
    });

    await expect(manager.start(ctx())).resolves.toBeUndefined();
  });
});
