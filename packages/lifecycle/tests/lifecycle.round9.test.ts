/**
 * @zudojs/lifecycle — Round 9 regression tests.
 */

import { describe, it, expect } from "vitest";
import { getEventListeners } from "node:events";
import { LifecycleState } from "@zudojs/constants";
import { LifecycleComponentError, LifecycleStartError } from "@zudojs/errors";
import { LifecycleManager, withAbort } from "../src/index.js";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("LIFECYCLE-R9-01: every result of a stage is recorded when a sibling fails", () => {
  it("transitions and records the successful sibling of a failing critical component", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    const initialized: string[] = [];
    manager.events.on("component:initialized", (e) =>
      initialized.push(e.component!.componentId),
    );

    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));

    // "ok" settles AFTER "bad" so its result comes later in the stage.
    manager.register({
      name: "ok",
      initialize: async () => {
        await gate;
      },
    });
    manager.register({
      name: "bad",
      initialize: async () => {
        throw new Error("boom");
      },
    });

    setTimeout(release, 10);
    await expect(manager.start()).rejects.toBeInstanceOf(LifecycleStartError);

    const ok = manager.getStatus().get("ok")!;
    expect(initialized).toEqual(["ok"]);
    expect(
      ok.results.some((r) => r.phase === "initialize" && r.success),
    ).toBe(true);
    // Rolled back: not stuck in INITIALIZING after disposal.
    expect(ok.state).toBe(LifecycleState.DISPOSED);
    manager.dispose();
  });
});

describe("LIFECYCLE-R9-02: a failed component and its dependents leave the startup pipeline", () => {
  it("does not run start()/ready() on a non-critical component whose initialize() failed", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    const calls: string[] = [];

    manager.register(
      {
        name: "optional",
        initialize: async () => {
          throw new Error("no config");
        },
        start: async () => {
          calls.push("start");
        },
        ready: async () => {
          calls.push("ready");
        },
      },
      { critical: false },
    );
    manager.register({ name: "core", start: async () => {} });

    await manager.start();

    expect(calls).toEqual([]);
    expect(manager.state).toBe(LifecycleState.READY);
    expect(manager.getStatus().get("optional")?.state).toBe(
      LifecycleState.FAILED,
    );
    manager.dispose();
  });

  it("skips a non-critical dependent of a failed dependency and records why", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    const calls: string[] = [];
    const failed: string[] = [];
    manager.events.on("component:failed", (e) =>
      failed.push(e.component!.componentId),
    );

    manager.register(
      {
        name: "db",
        initialize: async () => {
          throw new Error("no db");
        },
      },
      { critical: false },
    );
    manager.register(
      {
        name: "cache",
        initialize: async () => {
          calls.push("cache.initialize");
        },
        start: async () => {
          calls.push("cache.start");
        },
      },
      { dependsOn: ["db"], critical: false },
    );
    manager.register({ name: "core", start: async () => {} });

    await manager.start();

    expect(calls).toEqual([]);
    expect(manager.state).toBe(LifecycleState.READY);
    expect(failed).toEqual(["db", "cache"]);

    const cache = manager.getStatus().get("cache")!;
    expect(cache.state).toBe(LifecycleState.FAILED);
    const skipped = cache.results.find((r) => r.phase === "initialize")!;
    expect(skipped.success).toBe(false);
    expect(skipped.error).toBeInstanceOf(LifecycleComponentError);
    expect(String((skipped.error as Error).cause)).toContain('"db"');
    manager.dispose();
  });

  it("aborts startup when a CRITICAL dependent cannot start because its dependency failed", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    const calls: string[] = [];

    manager.register(
      {
        name: "db",
        initialize: async () => {
          throw new Error("no db");
        },
      },
      { critical: false },
    );
    manager.register(
      {
        name: "api",
        start: async () => {
          calls.push("api.start");
        },
      },
      { dependsOn: ["db"] },
    );

    const error = await manager.start().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LifecycleStartError);
    expect((error as LifecycleStartError).componentId).toBe("api");
    expect(calls).toEqual([]);
    expect(manager.state).toBe(LifecycleState.DISPOSED);
    manager.dispose();
  });
});

describe("LIFECYCLE-R9-03: rollback only undoes phases that ran", () => {
  it("does not call stop() on a component that never started", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    const calls: string[] = [];
    const failed: string[] = [];
    manager.events.on("component:failed", (e) =>
      failed.push(e.component!.componentId),
    );

    manager.register({
      name: "db",
      initialize: async () => {
        throw new Error("no db");
      },
    });
    manager.register(
      {
        name: "server",
        start: async () => {
          calls.push("server.start");
        },
        stop: async () => {
          calls.push("server.stop");
          throw new Error("ERR_SERVER_NOT_RUNNING");
        },
        dispose: async () => {
          calls.push("server.dispose");
        },
      },
      { dependsOn: ["db"] },
    );

    await expect(manager.start()).rejects.toBeInstanceOf(LifecycleStartError);

    expect(calls).toEqual([]);
    expect(failed).toEqual(["db"]);
    expect(manager.getStatus().get("server")?.state).toBe(
      LifecycleState.DISPOSED,
    );
    manager.dispose();
  });

  it("disposes but does not stop a component that was only initialized", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    const calls: string[] = [];

    manager.register({
      name: "config",
      initialize: async () => {
        calls.push("config.initialize");
      },
      stop: async () => {
        calls.push("config.stop");
      },
      dispose: async () => {
        calls.push("config.dispose");
      },
    });
    manager.register(
      {
        name: "broken",
        initialize: async () => {
          throw new Error("bad");
        },
      },
      { dependsOn: ["config"] },
    );

    await expect(manager.start()).rejects.toThrow();

    expect(calls).toEqual(["config.initialize", "config.dispose"]);
    expect(manager.getStatus().get("config")?.state).toBe(
      LifecycleState.DISPOSED,
    );
    manager.dispose();
  });

  it("runs no hooks when shutdown() is called on a manager that never started", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    const calls: string[] = [];
    manager.register({
      name: "server",
      stop: async () => {
        calls.push("stop");
      },
      dispose: async () => {
        calls.push("dispose");
      },
    });

    await manager.shutdown();

    expect(calls).toEqual([]);
    expect(manager.state).toBe(LifecycleState.DISPOSED);
    expect(manager.getStatus().get("server")?.state).toBe(
      LifecycleState.DISPOSED,
    );
    manager.dispose();
  });
});

describe("LIFECYCLE-R9-04: shutdown() during startup cancels the rest of startup", () => {
  it("waits for the in-flight stage and never launches later stages", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    const calls: string[] = [];

    manager.register({
      name: "db",
      start: async () => {
        calls.push("db.start:begin");
        await tick(20);
        calls.push("db.start:end");
      },
      stop: async () => {
        calls.push("db.stop");
      },
    });
    manager.register(
      {
        name: "server",
        start: async () => {
          calls.push("server.start");
        },
        stop: async () => {
          calls.push("server.stop");
        },
      },
      { dependsOn: ["db"] },
    );

    const start = manager.start().catch((e: unknown) => e);
    await tick(5);
    await manager.shutdown();
    calls.push("shutdown resolved");

    const error = await start;
    expect(error).toBeInstanceOf(LifecycleStartError);
    expect((error as LifecycleStartError).componentId).toBe("application");
    expect(calls).toEqual([
      "db.start:begin",
      "db.start:end",
      "db.stop",
      "shutdown resolved",
    ]);
    expect(manager.state).toBe(LifecycleState.DISPOSED);
    manager.dispose();
  });
});

describe("LIFECYCLE-R9-05: withAbort removes its listener on a synchronous throw", () => {
  it("leaves no abort listener behind", async () => {
    const controller = new AbortController();

    await expect(
      withAbort(() => {
        throw new Error("sync");
      }, controller.signal),
    ).rejects.toThrow("sync");

    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });
});
