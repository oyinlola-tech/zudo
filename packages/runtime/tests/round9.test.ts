import { describe, it, expect } from "vitest";
import type { Module } from "@zudojs/core";
import { createLogger } from "@zudojs/logger";
import { createContainer } from "@zudojs/container";
import { createEventBus } from "@zudojs/events";
import type { Event, EventBus } from "@zudojs/events";

import { createRuntime, DefaultRuntime } from "../src/runtime/runtime.core.js";
import { createTestRuntime } from "../src/testRuntime/index.js";
import { ReadinessTracker } from "../src/readiness/index.js";
import {
  assertTransition,
  canStart,
  canStop,
  hasFailed,
  isTerminalState,
} from "../src/runtimeState/index.js";
import { RuntimeStateError } from "../src/runtimeError/index.js";
import { RuntimeError } from "@zudojs/errors";
import { withRuntimeContextState } from "../src/runtimeContext/index.js";
import type { RuntimeModuleEventPayload } from "../src/runtimeEvents/index.js";

/** Collects every event published on a real bus. */
function collectingRuntime(modules: Module[]): {
  runtime: DefaultRuntime;
  events: Event[];
  bus: EventBus;
} {
  const bus = createEventBus();
  const events: Event[] = [];

  bus.onAny((event: Event) => {
    events.push(event);
  });

  const moduleMap = new Map<string, Module>();
  for (const module of modules) moduleMap.set(module.id, module);

  const runtime = new DefaultRuntime(
    {
      modules: moduleMap,
      logger: createLogger({ name: "round9" }),
      container: createContainer(),
      eventBus: bus,
    },
    {
      environment: "test",
      applicationName: "round9",
      handleSignals: false,
      handleFatalErrors: false,
      emitEvents: true,
    },
  );

  return { runtime, events, bus };
}

const noopModule = (id: string, deps: string[] = []): Module => ({
  id,
  name: `Module ${id}`,
  dependencies: deps,
});

/* ─── R-01: the context reports the failure path ──────────────────────────── */

describe("R-01 runtime.context carries every state field", () => {
  it("exposes stoppedAt after a clean stop", async () => {
    const runtime = createTestRuntime([]);
    await runtime.start();

    expect(runtime.context.startedAt).toBeInstanceOf(Date);
    expect(runtime.context.stoppedAt).toBeUndefined();

    await runtime.stop();

    // Previously dropped by withRuntimeContextState: the context claimed
    // a runtime that had never stopped.
    expect(runtime.context.stoppedAt).toBeInstanceOf(Date);
    expect(runtime.context.stoppedAt).toEqual(runtime.status.stoppedAt);
  });

  it("exposes failedAt and error after a failed start", async () => {
    const bad: Module = {
      id: "bad",
      name: "Bad",
      dependencies: [],
      onInitialize: async () => {
        throw new Error("module exploded");
      },
    };

    const runtime = createTestRuntime([bad]);

    await expect(runtime.start()).rejects.toThrow();

    expect(runtime.context.failedAt).toBeInstanceOf(Date);
    expect(runtime.context.error).toBeDefined();
    expect(runtime.context.error?.message).toMatch(/failed during initialization/);
    expect(runtime.context.state).toBe("failed");
  });

  it("withRuntimeContextState applies every field of RuntimeContextState", () => {
    const base = createTestRuntime([]).context;
    const stoppedAt = new Date(1);
    const failedAt = new Date(2);
    const error = new RuntimeError("boom");

    const next = withRuntimeContextState(base, {
      status: base.status,
      health: base.health,
      ready: false,
      startedAt: new Date(0),
      stoppedAt,
      failedAt,
      error,
    });

    expect(next.startedAt).toEqual(new Date(0));
    expect(next.stoppedAt).toBe(stoppedAt);
    expect(next.failedAt).toBe(failedAt);
    expect(next.error).toBe(error);
  });
});

/* ─── R-02: per-module lifecycle events ───────────────────────────────────── */

describe("R-02 runtime.module.* events are actually emitted", () => {
  it("emits initializing/initialized/starting/started with a module payload", async () => {
    const { runtime, events } = collectingRuntime([noopModule("a")]);

    await runtime.start();
    await new Promise((resolve) => setImmediate(resolve));

    const moduleEvents = events.filter((e) => e.type.startsWith("runtime.module."));

    expect(moduleEvents.map((e) => e.type)).toEqual([
      "runtime.module.initializing",
      "runtime.module.initialized",
      "runtime.module.starting",
      "runtime.module.started",
    ]);

    // RuntimeEventMap declares RuntimeModuleEventPayload for these; before
    // this round they carried no module at all.
    for (const event of moduleEvents) {
      const payload = event.payload as RuntimeModuleEventPayload;
      expect(payload.moduleId).toBe("a");
      expect(payload.moduleName).toBe("Module a");
      expect(typeof payload.runtimeId).toBe("string");
    }

    await runtime.stop();
  });

  it("emits stopping/stopped on shutdown", async () => {
    const { runtime, events } = collectingRuntime([noopModule("a")]);

    await runtime.start();
    events.length = 0;
    await runtime.stop();
    await new Promise((resolve) => setImmediate(resolve));

    const types = events.filter((e) => e.type.startsWith("runtime.module.")).map((e) => e.type);

    expect(types).toContain("runtime.module.stopping");
    expect(types).toContain("runtime.module.stopped");
  });

  it("emits runtime.module.failed naming the module that failed", async () => {
    const bad: Module = {
      id: "bad",
      name: "Bad Module",
      dependencies: [],
      onInitialize: async () => {
        throw new Error("nope");
      },
    };

    const { runtime, events } = collectingRuntime([bad]);

    await expect(runtime.start()).rejects.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    const failed = events.find((e) => e.type === "runtime.module.failed");
    expect(failed).toBeDefined();

    const payload = failed?.payload as RuntimeModuleEventPayload;
    expect(payload.moduleId).toBe("bad");
    expect(payload.moduleName).toBe("Bad Module");
    expect(payload.error?.message).toBe("nope");
    expect(typeof payload.durationMs).toBe("number");
  });

  it("a throwing module-event listener does not fail startup", async () => {
    const bus = createEventBus();
    bus.onAny(() => {
      throw new Error("listener exploded");
    });

    const runtime = new DefaultRuntime(
      {
        modules: new Map([["a", noopModule("a")]]),
        logger: createLogger({ name: "round9" }),
        container: createContainer(),
        eventBus: bus,
      },
      {
        environment: "test",
        applicationName: "round9",
        handleSignals: false,
        handleFatalErrors: false,
      },
    );

    await expect(runtime.start()).resolves.toBeUndefined();
    await runtime.stop();
  });
});

/* ─── R-03/R-04: options that were unreachable from createRuntime ─────────── */

describe("R-03 parallelInitialization is reachable from createRuntime", () => {
  it("initializes a depth group concurrently when enabled", async () => {
    let concurrent = 0;
    let peak = 0;

    const slow = (id: string): Module => ({
      id,
      name: id,
      dependencies: [],
      onInitialize: async () => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrent -= 1;
      },
    });

    const runtime = createTestRuntime([slow("a"), slow("b"), slow("c")], {
      parallelInitialization: true,
    });

    await runtime.start();
    await runtime.stop();

    expect(peak).toBeGreaterThan(1);
  });

  it("defaults to sequential initialization", async () => {
    let concurrent = 0;
    let peak = 0;

    const slow = (id: string): Module => ({
      id,
      name: id,
      dependencies: [],
      onInitialize: async () => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 5));
        concurrent -= 1;
      },
    });

    const runtime = createTestRuntime([slow("a"), slow("b")]);

    await runtime.start();
    await runtime.stop();

    expect(peak).toBe(1);
  });
});

describe("R-04 readinessCheckTimeout is reachable from createRuntime", () => {
  it("bounds a hanging readiness check at the configured timeout", async () => {
    const runtime = createTestRuntime([], { readinessCheckTimeout: 20 });

    runtime.registerReadinessCheck(
      "hangs",
      () => new Promise<boolean>(() => {}),
    );

    await runtime.start();

    const check = runtime.readiness.checks.get("hangs");
    expect(check?.ready).toBe(false);
    expect(check?.message).toMatch(/did not settle within 20ms/);
    expect(runtime.ready).toBe(false);

    await runtime.stop();
  });

  it("rejects a negative readiness check timeout with an actionable message", () => {
    expect(() => createTestRuntime([], { readinessCheckTimeout: -1 })).toThrow(
      /must be zero or positive, got -1\. Use 0 to run checks without a bound/,
    );
  });
});

/* ─── R-05: the exported state predicates govern the runtime ──────────────── */

describe("R-05 exported state predicates are load-bearing", () => {
  it("start is refused exactly where canStart says so", async () => {
    const runtime = createTestRuntime([]);

    expect(canStart("created")).toBe(true);
    await runtime.start();

    expect(canStart(runtime.state)).toBe(false);
    await runtime.stop();

    expect(canStart("stopped")).toBe(false);
    await expect(runtime.start()).rejects.toThrow(RuntimeStateError);
    await expect(runtime.start()).rejects.toThrow(
      /start is only valid from "created"/,
    );
  });

  it("stop is permitted exactly where canStop says so", async () => {
    expect(canStop("running")).toBe(true);
    expect(canStop("failed")).toBe(true);
    expect(canStop("stopped")).toBe(false);

    const bad: Module = {
      id: "bad",
      name: "bad",
      dependencies: [],
      onInitialize: async () => {
        throw new Error("no");
      },
    };

    const runtime = createTestRuntime([bad]);
    await expect(runtime.start()).rejects.toThrow();

    expect(hasFailed(runtime.state)).toBe(true);
    // A failed runtime is stoppable, which is the operator's only route
    // to releasing what rollback did not reach.
    await expect(runtime.stop()).resolves.toBeUndefined();
    expect(isTerminalState(runtime.state)).toBe(true);
  });

  it("assertTransition throws a typed error listing the legal transitions", () => {
    expect(() => assertTransition("stopped", "running")).toThrow(RuntimeStateError);
    expect(() => assertTransition("stopped", "running")).toThrow(
      /it is a terminal state/,
    );
    expect(() => assertTransition("created", "running")).toThrow(
      /Valid transitions from "created" are: "initializing", "stopped", "failed"/,
    );
    expect(() => assertTransition("created", "initializing")).not.toThrow();
  });
});

/* ─── R-09: readiness states the type declared but nothing produced ───────── */

describe("R-09 every ReadinessState is reachable", () => {
  it("reports shutting_down while stopping", async () => {
    const runtime = createTestRuntime([]);
    await runtime.start();

    expect(runtime.readiness.state).toBe("ready");

    await runtime.stop();

    // Previously markNotReady left this at "degraded", so no runtime
    // could ever report the "shutting_down" state the type declares.
    expect(runtime.readiness.state).toBe("shutting_down");
    expect(runtime.readiness.ready).toBe(false);
    expect(runtime.readiness.reason).toBe("Runtime is shutting down.");
  });

  it("reports initializing while modules are coming up", async () => {
    const seen: string[] = [];

    const slow: Module = {
      id: "slow",
      name: "slow",
      dependencies: [],
      onInitialize: async () => {
        seen.push(runtime.readiness.state);
      },
    };

    const runtime = createTestRuntime([slow]);
    await runtime.start();

    expect(seen).toEqual(["initializing"]);

    await runtime.stop();
  });

  it("setState is the route to those states on the tracker itself", () => {
    const tracker = new ReadinessTracker();

    tracker.setState("initializing", "coming up");
    expect(tracker.getState().state).toBe("initializing");
    expect(tracker.isReady()).toBe(false);

    tracker.setState("ready", "up");
    expect(tracker.isReady()).toBe(true);

    tracker.setState("shutting_down", "going down");
    expect(tracker.isReady()).toBe(false);
    expect(tracker.getState().reason).toBe("going down");
  });
});

/* ─── createRuntime still matches the documented shape ────────────────────── */

describe("createRuntime", () => {
  it("returns a runtime from the documented two-argument call", async () => {
    const runtime = createRuntime(
      {
        modules: new Map<string, Module>(),
        logger: createLogger({ name: "doc" }),
        container: createContainer(),
        eventBus: createEventBus(),
      },
      { environment: "test", applicationName: "doc-app" },
    );

    await runtime.start();
    expect(runtime.ready).toBe(true);
    await runtime.stop();
  });
});
