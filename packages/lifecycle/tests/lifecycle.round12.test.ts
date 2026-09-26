/**
 * Round 12 regression tests for @zudojs/lifecycle.
 *
 * One describe block per academy finding; each test reproduced the
 * finding against the source before the fix was written.
 */

import { describe, it, expect } from "vitest";
import { LifecycleState } from "@zudojs/constants";
import {
  LifecycleDependencyError,
  LifecycleError,
  LifecycleTimeoutError,
} from "@zudojs/errors";
import {
  DependencyGraph,
  LifecycleManager,
  topologicalSort,
} from "../src/index.js";
import type { LifecycleEvent, LifecycleEventType } from "../src/index.js";

function collect(
  manager: LifecycleManager,
  types: readonly LifecycleEventType[],
): LifecycleEvent[] {
  const events: LifecycleEvent[] = [];
  for (const type of types) {
    manager.events.on(type, (event) => {
      events.push(event);
    });
  }
  return events;
}

describe("#1 topologicalSort reports the real cycle", () => {
  it("names the loop rather than every blocked node", () => {
    const graph = new DependencyGraph();
    for (const node of ["config", "logger", "database", "cache", "queue", "http"]) {
      graph.addNode(node);
    }
    const edges: readonly (readonly [string, string])[] = [
      ["logger", "config"],
      ["database", "config"],
      ["database", "logger"],
      ["cache", "config"],
      ["queue", "database"],
      ["http", "database"],
      ["http", "cache"],
      ["config", "http"],
    ];
    for (const [from, to] of edges) graph.addEdge(from, to);

    let thrown: unknown;
    try {
      topologicalSort(graph);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(LifecycleDependencyError);
    const cycle = (thrown as LifecycleDependencyError).cycle;

    expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    for (let i = 0; i < cycle.length - 1; i++) {
      expect(graph.getDependencies(cycle[i]!)).toContain(cycle[i + 1]);
    }
    expect(cycle).not.toContain("logger");
    expect(cycle).not.toContain("queue");
  });
});

describe("#2 edges to undeclared nodes can be detected", () => {
  it("getUndeclaredNodes() and validate({ requireDeclared }) expose the typo", () => {
    const graph = new DependencyGraph();
    graph.addNode("a");
    graph.addEdge("a", "missing");

    expect(graph.getUndeclaredNodes()).toEqual(["missing"]);
    expect(() => graph.validate({ requireDeclared: true })).toThrow(
      /"a" depends on "missing"/,
    );
    expect(() => graph.validate({ requireDeclared: true })).toThrow(LifecycleError);

    // addEdge has always created its endpoints; the permissive default
    // still sorts the phantom as a leaf so existing callers are unaffected.
    expect(() => graph.validate()).not.toThrow();
    expect(topologicalSort(graph)[0]).toEqual(["missing"]);

    graph.addNode("missing");
    expect(graph.getUndeclaredNodes()).toEqual([]);
    expect(() => graph.validate({ requireDeclared: true })).not.toThrow();
  });

  it("the manager still names the missing dependency at start()", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    manager.register({ name: "a" }, { dependsOn: ["missing"] });

    await expect(manager.start()).rejects.toThrow(/"missing" which is not registered/);
    manager.dispose();
  });
});

describe("#3 topologicalSort is linear in the graph size", () => {
  it("orders a 20000-node chain quickly", () => {
    const graph = new DependencyGraph();
    const size = 20_000;
    graph.addNode("c0");
    for (let i = 1; i < size; i++) {
      graph.addNode(`c${i}`);
      graph.addEdge(`c${i}`, `c${i - 1}`);
    }

    const started = performance.now();
    const stages = topologicalSort(graph);
    const elapsed = performance.now() - started;

    expect(stages).toHaveLength(size);
    expect(stages[0]).toEqual(["c0"]);
    expect(stages[size - 1]).toEqual([`c${size - 1}`]);
    expect(elapsed).toBeLessThan(1500);
  });

  it("keeps priority order, then registration order, within a stage", () => {
    const graph = new DependencyGraph();
    for (const node of ["a", "b", "c", "d"]) graph.addNode(node);
    graph.addEdge("d", "a");
    const priorities = new Map([["b", 10], ["c", 0], ["a", 0]]);

    const stages = topologicalSort(graph, priorities);

    expect(stages).toEqual([["b", "a", "c"], ["d"]]);
  });
});

describe("#29 a component timeout bounds start()", () => {
  it("aborts the hook's signal and rejects start() near the timeout", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    let aborted = false;

    manager.register(
      {
        name: "slow",
        start: (context) =>
          new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 3_000);
            context.signal.addEventListener("abort", () => {
              aborted = true;
              clearTimeout(timer);
              resolve();
            });
          }),
      },
      { timeout: 100, retry: { attempts: 0 } },
    );

    const started = Date.now();
    await expect(manager.start()).rejects.toThrow();

    expect(Date.now() - started).toBeLessThan(800);
    expect(aborted).toBe(true);
    manager.dispose();
  });

  it("a hook that ignores the signal cannot hold start() past its own timeout twice over", async () => {
    const manager = new LifecycleManager({
      handleSignals: false,
      shutdownTimeout: 10_000,
    });
    const stops: string[] = [];

    manager.register(
      {
        name: "stuck",
        start: () => new Promise<void>(() => {}),
        stop: async () => {
          stops.push("stuck");
        },
      },
      { timeout: 100, retry: { attempts: 0 } },
    );

    const started = Date.now();
    await expect(manager.start()).rejects.toThrow();

    expect(Date.now() - started).toBeLessThan(1_500);
    expect(stops).toEqual([]);

    const results = manager.getStatus().get("stuck")?.results ?? [];
    expect(results.find((r) => r.phase === "start")?.timedOut).toBe(true);
    expect(results.find((r) => r.phase === "stop")?.timedOut).toBe(true);
    manager.dispose();
  });
});

describe("#30 shutdown deadline expiry is reported", () => {
  it("emits application:shutdown-timeout, fails the hung component and goes quiet afterwards", async () => {
    const manager = new LifecycleManager({
      handleSignals: false,
      shutdownTimeout: 100,
    });
    let release: (() => void) | undefined;

    manager.register(
      {
        name: "hung",
        start: async () => {},
        stop: () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      },
      { timeout: 5_000 },
    );

    const events = collect(manager, [
      "application:shutdown-timeout",
      "component:failed",
      "component:stopped",
      "application:stopped",
    ]);

    await manager.start();
    expect(manager.shutdownTimedOut).toBe(false);

    await manager.shutdown();

    expect(manager.shutdownTimedOut).toBe(true);
    expect(manager.state).toBe(LifecycleState.DISPOSED);

    const timeoutEvent = events.find((e) => e.type === "application:shutdown-timeout");
    expect(timeoutEvent).toBeDefined();
    expect(timeoutEvent?.error).toBeInstanceOf(LifecycleTimeoutError);

    const status = manager.getStatus().get("hung");
    expect(status?.state).toBe(LifecycleState.FAILED);
    expect(status?.results.at(-1)?.error).toBeInstanceOf(LifecycleTimeoutError);
    expect(events.some((e) => e.type === "component:failed" && e.component?.componentId === "hung")).toBe(true);

    const seenBefore = events.length;
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(events.length).toBe(seenBefore);
    expect(manager.getStatus().get("hung")?.state).toBe(LifecycleState.FAILED);
    manager.dispose();
  });
});

describe("#31 stop() only runs for components that started", () => {
  it("skips stop() for a non-critical component whose start() threw", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    const calls: string[] = [];

    manager.register(
      {
        name: "flaky",
        start: async () => {
          throw new Error("boom");
        },
        stop: async () => {
          calls.push("flaky.stop");
        },
        dispose: async () => {
          calls.push("flaky.dispose");
        },
      },
      { critical: false, retry: { attempts: 0 } },
    );
    manager.register({
      name: "ok",
      start: async () => {},
      stop: async () => {
        calls.push("ok.stop");
      },
    });

    await manager.start();
    await manager.shutdown();

    expect(calls).toEqual(["ok.stop", "flaky.dispose"]);
    manager.dispose();
  });

  it("skips stop() for the critical component that failed during rollback", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    const calls: string[] = [];

    manager.register({
      name: "first",
      start: async () => {},
      stop: async () => {
        calls.push("first.stop");
      },
    });
    manager.register(
      {
        name: "broken",
        initialize: async () => {},
        start: async () => {
          throw new Error("listen EADDRINUSE");
        },
        stop: async () => {
          calls.push("broken.stop");
        },
        dispose: async () => {
          calls.push("broken.dispose");
        },
      },
      { dependsOn: ["first"], retry: { attempts: 0 } },
    );

    await expect(manager.start()).rejects.toThrow();

    expect(calls).toEqual(["first.stop", "broken.dispose"]);
    manager.dispose();
  });
});

describe("#32 retry semantics are what the docs say", () => {
  it("attempts counts retries after the first call and backs off exponentially", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    const stamps: number[] = [];

    manager.register(
      {
        name: "retrying",
        start: async () => {
          stamps.push(Date.now());
          if (stamps.length < 4) throw new Error("not yet");
        },
      },
      { retry: { attempts: 3, delay: 10 } },
    );

    await manager.start();

    expect(stamps).toHaveLength(4);
    expect(stamps[2]! - stamps[1]!).toBeGreaterThanOrEqual(stamps[1]! - stamps[0]!);
    await manager.shutdown();
    manager.dispose();
  });
});

describe("#33 ready and dispose phases have their own event names", () => {
  it("does not reuse starting/stopping/stopped for ready and dispose", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    const events = collect(manager, [
      "component:starting",
      "component:readying",
      "component:ready",
      "component:stopping",
      "component:stopped",
      "component:disposing",
      "component:disposed",
      "application:starting",
      "application:readying",
      "application:disposing",
      "application:disposed",
    ]);

    manager.register({
      name: "svc",
      start: async () => {},
      ready: async () => {},
      stop: async () => {},
      dispose: async () => {},
    });

    await manager.start();
    await manager.shutdown();

    const types = events.map((e) => e.type);
    const count = (type: LifecycleEventType): number =>
      types.filter((t) => t === type).length;

    expect(count("component:starting")).toBe(1);
    expect(count("component:readying")).toBe(1);
    expect(count("component:ready")).toBe(1);
    expect(count("component:stopping")).toBe(1);
    expect(count("component:stopped")).toBe(1);
    expect(count("component:disposing")).toBe(1);
    expect(count("component:disposed")).toBe(1);
    expect(count("application:starting")).toBe(1);
    expect(count("application:readying")).toBe(1);
    expect(count("application:disposing")).toBe(1);
    expect(count("application:disposed")).toBe(1);
    manager.dispose();
  });
});

describe("#136 retries are observable through events", () => {
  it("emits component:retrying with the attempt number and delay", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    const retries = collect(manager, ["component:retrying"]);
    let calls = 0;

    manager.register(
      {
        name: "retrying",
        start: async () => {
          calls += 1;
          if (calls < 3) throw new Error("no");
        },
      },
      { retry: { attempts: 3, delay: 5, backoff: "exponential" } },
    );

    await manager.start();

    expect(retries.map((e) => e.component?.componentId)).toEqual(["retrying", "retrying"]);
    expect(retries.map((e) => e.component?.attempt)).toEqual([1, 2]);
    expect(retries.map((e) => e.component?.delay)).toEqual([5, 10]);
    expect(retries[0]?.component?.error).toBeInstanceOf(Error);
    await manager.shutdown();
    manager.dispose();
  });
});
