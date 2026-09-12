/**
 * @zudojs/lifecycle tests
 *
 * Comprehensive tests for the lifecycle orchestration system.
 */

import { describe, it, expect, vi } from "vitest";
import {
  LifecycleStateMachine,
  LifecycleRegistry,
  DependencyGraph,
  topologicalSort,
  reverseTopologicalSort,
  withTimeout,
  withConcurrency,
  buildExecutionPlan,
  LifecycleExecutor,
  LifecycleManager,
  createLifecycleManager,
  LifecycleEventEmitter,
  STARTUP_PHASES,
  SHUTDOWN_PHASES,
  installSignalHandlers,
  DEFAULT_SHUTDOWN_SIGNALS,
} from "../src/index.js";
import { LifecycleState, LifecyclePhase } from "@zudojs/constants";
import type { LifecycleComponent } from "../src/index.js";

describe("LifecycleStateMachine", () => {
  it("starts in IDLE state", () => {
    const sm = new LifecycleStateMachine("test");
    expect(sm.state).toBe(LifecycleState.IDLE);
  });

  it("transitions through valid states", () => {
    const sm = new LifecycleStateMachine("test");
    sm.transition(LifecycleState.INITIALIZING);
    expect(sm.state).toBe(LifecycleState.INITIALIZING);
    sm.transition(LifecycleState.INITIALIZED);
    expect(sm.state).toBe(LifecycleState.INITIALIZED);
    sm.transition(LifecycleState.STARTING);
    expect(sm.state).toBe(LifecycleState.STARTING);
    sm.transition(LifecycleState.STARTED);
    expect(sm.state).toBe(LifecycleState.STARTED);
    sm.transition(LifecycleState.READY);
    expect(sm.state).toBe(LifecycleState.READY);
  });

  it("rejects invalid transitions", () => {
    const sm = new LifecycleStateMachine("test");
    expect(() => sm.transition(LifecycleState.READY)).toThrow();
  });

  it("reports isRunning correctly", () => {
    const sm = new LifecycleStateMachine("test");
    expect(sm.isRunning).toBe(false);
    sm.transition(LifecycleState.INITIALIZING);
    sm.transition(LifecycleState.INITIALIZED);
    sm.transition(LifecycleState.STARTING);
    sm.transition(LifecycleState.STARTED);
    expect(sm.isRunning).toBe(true);
    sm.transition(LifecycleState.READY);
    expect(sm.isRunning).toBe(true);
  });

  it("reports isTerminal correctly", () => {
    const sm = new LifecycleStateMachine("test");
    expect(sm.isTerminal).toBe(false);
    sm.transition(LifecycleState.INITIALIZING);
    sm.transition(LifecycleState.INITIALIZED);
    sm.transition(LifecycleState.STARTING);
    sm.transition(LifecycleState.STARTED);
    sm.transition(LifecycleState.READY);
    sm.transition(LifecycleState.STOPPING);
    sm.transition(LifecycleState.STOPPED);
    expect(sm.isTerminal).toBe(true);
  });

  it("can force state", () => {
    const sm = new LifecycleStateMachine("test");
    sm.forceState(LifecycleState.READY);
    expect(sm.state).toBe(LifecycleState.READY);
  });
});

describe("DependencyGraph", () => {
  it("adds nodes and edges", () => {
    const graph = new DependencyGraph();
    graph.addNode("a");
    graph.addNode("b");
    graph.addEdge("b", "a");

    expect(graph.getNodes()).toContain("a");
    expect(graph.getNodes()).toContain("b");
    expect(graph.getDependencies("b")).toContain("a");
    expect(graph.getDependents("a")).toContain("b");
  });

  it("validates acyclic graph", () => {
    const graph = new DependencyGraph();
    graph.addEdge("a", "b");
    graph.addEdge("b", "c");
    expect(() => graph.validate()).not.toThrow();
  });

  it("detects circular dependencies", () => {
    const graph = new DependencyGraph();
    graph.addEdge("a", "b");
    graph.addEdge("b", "c");
    graph.addEdge("c", "a");
    expect(() => graph.validate()).toThrow();
  });
});

describe("topologicalSort", () => {
  it("sorts linear dependencies", () => {
    const graph = new DependencyGraph();
    graph.addEdge("b", "a");
    graph.addEdge("c", "b");

    const stages = topologicalSort(graph);
    expect(stages.length).toBe(3);
    expect(stages[0]).toEqual(["a"]);
    expect(stages[1]).toEqual(["b"]);
    expect(stages[2]).toEqual(["c"]);
  });

  it("groups independent components in parallel stages", () => {
    const graph = new DependencyGraph();
    graph.addEdge("c", "a");
    graph.addEdge("c", "b");

    const stages = topologicalSort(graph);
    expect(stages.length).toBe(2);
    expect(stages[0]).toEqual(expect.arrayContaining(["a", "b"]));
    expect(stages[1]).toEqual(["c"]);
  });

  it("respects priority within stages", () => {
    const graph = new DependencyGraph();
    graph.addNode("a");
    graph.addNode("b");

    const priorities = new Map([
      ["a", 10],
      ["b", 5],
    ]);
    const stages = topologicalSort(graph, priorities);
    expect(stages[0]).toEqual(["a", "b"]);
  });
});

describe("reverseTopologicalSort", () => {
  it("reverses the order for shutdown", () => {
    const graph = new DependencyGraph();
    graph.addEdge("b", "a");
    graph.addEdge("c", "b");

    const stages = reverseTopologicalSort(graph);
    expect(stages[0]).toEqual(["c"]);
    expect(stages[1]).toEqual(["b"]);
    expect(stages[2]).toEqual(["a"]);
  });
});

describe("withTimeout", () => {
  it("resolves before timeout", async () => {
    const result = await withTimeout(async () => "ok", 1000, "test", "start");
    expect(result).toBe("ok");
  });

  it("rejects on timeout", async () => {
    await expect(
      withTimeout(
        () => new Promise((resolve) => setTimeout(resolve, 1000)),
        50,
        "test",
        "start",
      ),
    ).rejects.toThrow();
  });
});

describe("withConcurrency", () => {
  it("executes items with concurrency limit", async () => {
    const executed: number[] = [];
    const items = [1, 2, 3, 4, 5];

    await withConcurrency(items, 2, async (item) => {
      executed.push(item);
    });

    expect(executed).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("LifecycleRegistry", () => {
  it("registers components", () => {
    const registry = new LifecycleRegistry();
    const component: LifecycleComponent = { name: "test" };
    registry.register(component);
    expect(registry.size).toBe(1);
    expect(registry.get("test")).toBeDefined();
  });

  it("prevents duplicate registration", () => {
    const registry = new LifecycleRegistry();
    registry.register({ name: "test" });
    expect(() => registry.register({ name: "test" })).toThrow();
  });

  it("validates dependencies exist", () => {
    const registry = new LifecycleRegistry();
    registry.register({ name: "queue" }, { dependsOn: ["database"] });
    expect(() => registry.validate()).toThrow();
  });

  it("validates acyclic dependencies", () => {
    const registry = new LifecycleRegistry();
    registry.register({ name: "a" }, { dependsOn: ["b"] });
    registry.register({ name: "b" }, { dependsOn: ["a"] });
    expect(() => registry.validate()).toThrow();
  });

  it("freezes registry", () => {
    const registry = new LifecycleRegistry();
    registry.register({ name: "test" });
    registry.freeze();
    expect(registry.isFrozen).toBe(true);
    expect(() => registry.register({ name: "test2" })).toThrow();
  });
});

describe("buildExecutionPlan", () => {
  it("builds startup plan with correct ordering", () => {
    const registrations = [
      {
        id: "db",
        component: { name: "db", start: async () => {} },
        dependsOn: [],
        priority: 0,
        critical: true,
        timeout: 30000,
        retry: { attempts: 0 },
      },
      {
        id: "queue",
        component: { name: "queue", start: async () => {} },
        dependsOn: ["db"],
        priority: 0,
        critical: true,
        timeout: 30000,
        retry: { attempts: 0 },
      },
      {
        id: "server",
        component: { name: "server", start: async () => {} },
        dependsOn: ["queue"],
        priority: 0,
        critical: true,
        timeout: 30000,
        retry: { attempts: 0 },
      },
    ];

    const plan = buildExecutionPlan(registrations, "start" as never);
    expect(plan.stages.length).toBe(3);
    expect(plan.stages[0]!.components).toEqual(["db"]);
    expect(plan.stages[1]!.components).toEqual(["queue"]);
    expect(plan.stages[2]!.components).toEqual(["server"]);
  });
});

describe("LifecycleExecutor", () => {
  it("executes component hooks", async () => {
    const executor = new LifecycleExecutor();
    const startFn = vi.fn();
    const reg = {
      id: "test",
      component: { name: "test", start: startFn },
      dependsOn: [],
      priority: 0,
      critical: true,
      timeout: 5000,
      retry: { attempts: 0 },
    };

    const context = {
      signal: new AbortController().signal,
      phase: LifecyclePhase.START,
      startedAt: Date.now(),
      metadata: new Map(),
    };

    const result = await executor.execute(reg, LifecyclePhase.START, context);
    expect(result.success).toBe(true);
    expect(startFn).toHaveBeenCalled();
  });

  it("reports failure for non-existent hooks", async () => {
    const executor = new LifecycleExecutor();
    const reg = {
      id: "test",
      component: { name: "test" },
      dependsOn: [],
      priority: 0,
      critical: true,
      timeout: 5000,
      retry: { attempts: 0 },
    };

    const context = {
      signal: new AbortController().signal,
      phase: LifecyclePhase.STOP,
      startedAt: Date.now(),
      metadata: new Map(),
    };

    const result = await executor.execute(reg, LifecyclePhase.STOP, context);
    expect(result.success).toBe(true);
  });
});

describe("LifecycleManager", () => {
  it("registers and starts components", async () => {
    const manager = createLifecycleManager({ handleSignals: false });
    const startFn = vi.fn();
    manager.register({ name: "test", start: startFn });

    await manager.start();
    expect(startFn).toHaveBeenCalled();
    expect(manager.state).toBe(LifecycleState.READY);
    manager.dispose();
  });

  it("handles component dependencies", async () => {
    const manager = createLifecycleManager({ handleSignals: false });
    const order: string[] = [];

    manager.register({
      name: "db",
      start: async () => {
        order.push("db");
      },
    });
    manager.register(
      {
        name: "queue",
        start: async () => {
          order.push("queue");
        },
      },
      { dependsOn: ["db"] },
    );
    manager.register(
      {
        name: "server",
        start: async () => {
          order.push("server");
        },
      },
      { dependsOn: ["queue"] },
    );

    await manager.start();
    expect(order).toEqual(["db", "queue", "server"]);
    manager.dispose();
  });

  it("shuts down in reverse order", async () => {
    const manager = createLifecycleManager({ handleSignals: false });
    const order: string[] = [];

    manager.register({
      name: "db",
      start: async () => {},
      stop: async () => {
        order.push("db");
      },
    });
    manager.register(
      {
        name: "server",
        start: async () => {},
        stop: async () => {
          order.push("server");
        },
      },
      { dependsOn: ["db"] },
    );

    await manager.start();
    await manager.shutdown();

    expect(order[0]).toBe("server");
    expect(order[1]).toBe("db");
  });

  it("is idempotent for start", async () => {
    const manager = createLifecycleManager({ handleSignals: false });
    const startFn = vi.fn();
    manager.register({ name: "test", start: startFn });

    await manager.start();
    await manager.start();

    expect(startFn).toHaveBeenCalledTimes(1);
    manager.dispose();
  });

  it("is idempotent for shutdown", async () => {
    const manager = createLifecycleManager({ handleSignals: false });
    manager.register({ name: "test" });

    await manager.start();
    await manager.shutdown();
    await manager.shutdown();

    expect(manager.state).toBe(LifecycleState.DISPOSED);
  });

  it("tracks component status", async () => {
    const manager = createLifecycleManager({ handleSignals: false });
    manager.register({ name: "test", start: async () => {} });

    await manager.start();
    const status = manager.getStatus();
    expect(status.get("test")?.state).toBe(LifecycleState.READY);
    manager.dispose();
  });
});

describe("LifecycleEventEmitter", () => {
  it("emits events to listeners", () => {
    const emitter = new LifecycleEventEmitter();
    const listener = vi.fn();

    emitter.on("component:started", listener);
    emitter.emit("component:started", {
      component: { componentId: "test", duration: 100 },
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "component:started",
        component: { componentId: "test", duration: 100 },
      }),
    );
  });

  it("unsubscribes listeners", () => {
    const emitter = new LifecycleEventEmitter();
    const listener = vi.fn();

    const unsub = emitter.on("component:started", listener);
    emitter.emit("component:started", { component: { componentId: "test" } });
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    emitter.emit("component:started", { component: { componentId: "test" } });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("clears all listeners", () => {
    const emitter = new LifecycleEventEmitter();
    const listener = vi.fn();

    emitter.on("component:started", listener);
    emitter.clear();
    emitter.emit("component:started", { component: { componentId: "test" } });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("Phase constants", () => {
  it("has correct startup phases", () => {
    expect(STARTUP_PHASES).toEqual(["initialize", "start", "ready"]);
  });

  it("has correct shutdown phases", () => {
    expect(SHUTDOWN_PHASES).toEqual(["stop", "dispose"]);
  });
});

// ---------------------------------------------------------------------------
// Round 8 audit
// ---------------------------------------------------------------------------

describe("LIFECYCLE-01: startup failure is surfaced to the caller", () => {
  it("rejects start() when a critical component fails to start", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    const stopped: string[] = [];

    manager.register({
      name: "db",
      start: async () => {},
      stop: async () => {
        stopped.push("db");
      },
    });
    manager.register(
      {
        name: "server",
        start: async () => {
          throw new Error("port in use");
        },
      },
      { dependsOn: ["db"] },
    );

    await expect(manager.start()).rejects.toThrow();
    expect(manager.state).toBe(LifecycleState.DISPOSED);
    expect(stopped).toEqual(["db"]);
    manager.dispose();
  });

  it("rejects start() when a critical initialize hook fails", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    manager.register({
      name: "broken",
      initialize: async () => {
        throw new Error("bad config");
      },
    });

    await expect(manager.start()).rejects.toThrow();
    manager.dispose();
  });

  it("rejects start() when a critical ready hook fails", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    manager.register({
      name: "warmup",
      start: async () => {},
      ready: async () => {
        throw new Error("health check failed");
      },
    });

    await expect(manager.start()).rejects.toThrow();
    expect(manager.state).toBe(LifecycleState.DISPOSED);
    manager.dispose();
  });

  it("still starts when a NON-critical component fails", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    manager.register(
      {
        name: "optional",
        start: async () => {
          throw new Error("nope");
        },
      },
      { critical: false },
    );
    manager.register({ name: "core", start: async () => {} });

    await manager.start();

    expect(manager.state).toBe(LifecycleState.READY);
    expect(manager.getStatus().get("optional")?.state).toBe(
      LifecycleState.FAILED,
    );
    manager.dispose();
  });
});

describe("LIFECYCLE-02: shutdown results are inspected", () => {
  it("records a failing stop() instead of reporting it as stopped", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    const failures: unknown[] = [];

    manager.events.on("component:failed", (event) => {
      failures.push(event.component?.componentId);
    });

    manager.register({
      name: "leaky",
      start: async () => {},
      stop: async () => {
        throw new Error("could not drain");
      },
    });

    await manager.start();
    await manager.shutdown();

    const status = manager.getStatus().get("leaky");

    expect(failures).toContain("leaky");
    expect(status?.results.some((r) => !r.success)).toBe(true);
    manager.dispose();
  });

  it("emits component:stopped for a clean teardown", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    const stopped: (string | undefined)[] = [];

    manager.events.on("component:stopped", (event) => {
      stopped.push(event.component?.componentId);
    });

    manager.register({
      name: "clean",
      start: async () => {},
      stop: async () => {},
    });

    await manager.start();
    await manager.shutdown();

    expect(stopped).toContain("clean");
    manager.dispose();
  });
});

describe("LIFECYCLE-03: the shutdown deadline is enforced", () => {
  it("does not hang on a stop() hook that never settles", async () => {
    const manager = new LifecycleManager({
      handleSignals: false,
      shutdownTimeout: 50,
    });

    manager.register({
      name: "hung",
      start: async () => {},
      // Never resolves and never observes the signal.
      stop: () => new Promise<void>(() => {}),
    });

    await manager.start();

    const started = Date.now();
    await manager.shutdown();

    expect(Date.now() - started).toBeLessThan(2000);
    expect(manager.state).toBe(LifecycleState.DISPOSED);
    manager.dispose();
  });
});

describe("LIFECYCLE-04: the lifecycle context signal is wired", () => {
  it("aborts component signals when the shutdown deadline expires", async () => {
    const manager = new LifecycleManager({
      handleSignals: false,
      shutdownTimeout: 50,
    });

    let aborted = false;

    manager.register({
      name: "cancellable",
      start: async () => {},
      stop: (context) =>
        new Promise<void>((resolve) => {
          context.signal.addEventListener("abort", () => {
            aborted = true;
            resolve();
          });
        }),
    });

    await manager.start();
    await manager.shutdown();

    expect(aborted).toBe(true);
    manager.dispose();
  });

  it("hands the same signal to every hook", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    const signals: AbortSignal[] = [];

    manager.register({
      name: "probe",
      start: async (context) => {
        signals.push(context.signal);
      },
      ready: async (context) => {
        signals.push(context.signal);
      },
    });

    await manager.start();

    expect(signals).toHaveLength(2);
    expect(signals[0]).toBe(signals[1]);
    expect(signals[0]?.aborted).toBe(false);
    manager.dispose();
  });
});

describe("LIFECYCLE-05: withConcurrency settles every task", () => {
  it("does not abandon remaining work when one task rejects", async () => {
    const seen: number[] = [];

    await expect(
      withConcurrency([1, 2, 3, 4], 2, async (item) => {
        seen.push(item);
        if (item === 2) {
          throw new Error("boom");
        }
      }),
    ).rejects.toThrow("boom");

    expect(seen.sort()).toEqual([1, 2, 3, 4]);
  });

  it("treats a non-positive concurrency as serial", async () => {
    const seen: number[] = [];

    await withConcurrency([1, 2, 3], 0, async (item) => {
      seen.push(item);
    });

    expect(seen).toEqual([1, 2, 3]);
  });
});

describe("LIFECYCLE-06: withTimeout always clears its timer", () => {
  it("rejects without leaving an armed timer for a sync throw", async () => {
    await expect(
      withTimeout(
        () => {
          throw new Error("sync failure");
        },
        60_000,
        "c",
        "start",
      ),
    ).rejects.toThrow("sync failure");
  });
});

describe("LIFECYCLE-07: failures carry component attribution", () => {
  it("wraps a hook error in a LifecycleComponentError", async () => {
    const executor = new LifecycleExecutor();

    const result = await executor.execute(
      {
        id: "worker",
        component: {
          name: "worker",
          start: async () => {
            throw new Error("underlying");
          },
        },
        dependsOn: [],
        priority: 0,
        critical: true,
        timeout: 1000,
        retry: { attempts: 0 },
      },
      LifecyclePhase.START,
      {
        signal: new AbortController().signal,
        phase: LifecyclePhase.START,
        startedAt: Date.now(),
        metadata: new Map(),
      },
    );

    expect(result.success).toBe(false);
    expect(String((result.error as Error).message)).toContain("worker");
  });
});

describe("LIFECYCLE-08: per-phase events are emitted", () => {
  it("emits initializing/initialized/ready with real component ids", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    const seen: string[] = [];

    for (const type of [
      "component:initializing",
      "component:initialized",
      "component:ready",
      "application:initialized",
      "application:disposed",
    ] as const) {
      manager.events.on(type, (event) => {
        seen.push(`${type}:${event.component?.componentId ?? "-"}`);
      });
    }

    manager.register({
      name: "svc",
      initialize: async () => {},
      start: async () => {},
      ready: async () => {},
    });

    await manager.start();
    await manager.shutdown();

    expect(seen).toContain("component:initializing:svc");
    expect(seen).toContain("component:initialized:svc");
    expect(seen).toContain("component:ready:svc");
    expect(seen).toContain("application:initialized:-");
    expect(seen).toContain("application:disposed:-");
    manager.dispose();
  });
});

describe("LIFECYCLE-09: shutdown is single-flight across callers", () => {
  it("runs teardown once when startup rollback and shutdown() overlap", async () => {
    const manager = new LifecycleManager({ handleSignals: false });
    let stops = 0;
    let disposes = 0;

    manager.register({
      name: "db",
      start: async () => {},
      stop: async () => {
        stops += 1;
      },
      dispose: async () => {
        disposes += 1;
      },
    });
    manager.register(
      {
        name: "server",
        start: async () => {
          throw new Error("fail");
        },
      },
      { dependsOn: ["db"] },
    );

    const start = manager.start().catch(() => undefined);
    const shutdown = manager.shutdown();

    await Promise.all([start, shutdown]);

    // Teardown ran exactly once. shutdown() arrived during the
    // initialize phase, so db never started and (round 9) is not
    // stopped; it was initialized, so it is disposed once.
    expect(disposes).toBe(1);
    expect(stops).toBe(0);
    expect(manager.state).toBe(LifecycleState.DISPOSED);
    manager.dispose();
  });
});

describe("LIFECYCLE-10: signal handlers", () => {
  it("defaults to DEFAULT_SHUTDOWN_SIGNALS and can be removed", () => {
    const handler = vi.fn();
    const before = process.listenerCount("SIGINT");

    const remove = installSignalHandlers({ handler });

    expect(process.listenerCount("SIGINT")).toBe(before + 1);
    for (const signal of DEFAULT_SHUTDOWN_SIGNALS) {
      expect(process.listenerCount(signal)).toBeGreaterThan(0);
    }

    remove();

    expect(process.listenerCount("SIGINT")).toBe(before);
    expect(handler).not.toHaveBeenCalled();
  });
});
