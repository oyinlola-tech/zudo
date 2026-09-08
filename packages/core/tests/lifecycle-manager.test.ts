import { describe, it, expect, vi } from "vitest";
import {
  LifecycleManager,
  LifecycleScope,
  LifecycleScopeState,
  LifecycleRegistry,
  LifecycleState,
  InvalidArgumentError,
  InvalidStateError,
} from "../src/index.js";
import type { LifecycleParticipant, LifecycleHook } from "../src/index.js";

function participant(
  name: string,
  order: string[],
  hooks: Partial<
    Record<"initialize" | "start" | "stop" | "dispose", boolean>
  > = { initialize: true, start: true, stop: true, dispose: true },
): LifecycleParticipant {
  const record = (phase: string) => () => {
    order.push(`${name}:${phase}`);
  };
  return {
    name,
    initialize: hooks.initialize ? record("initialize") : undefined,
    start: hooks.start ? record("start") : undefined,
    stop: hooks.stop ? record("stop") : undefined,
    dispose: hooks.dispose ? record("dispose") : undefined,
  };
}

function hook(name: string, order: string[]): LifecycleHook {
  return {
    onInitialize: () => {
      order.push(`${name}:initialize`);
    },
    onStart: () => {
      order.push(`${name}:start`);
    },
    onStop: () => {
      order.push(`${name}:stop`);
    },
    onDestroy: () => {
      order.push(`${name}:destroy`);
    },
  };
}

describe("LifecycleManager", () => {
  it("runs hooks and participants in global registration order", async () => {
    const order: string[] = [];
    const manager = new LifecycleManager();

    manager.register(hook("hookA", order));
    manager.register(participant("partB", order));
    manager.register(hook("hookC", order));

    await manager.start();

    expect(order).toEqual([
      "hookA:initialize",
      "partB:initialize",
      "hookC:initialize",
      "hookA:start",
      "partB:start",
      "hookC:start",
    ]);

    order.length = 0;
    await manager.shutdown();

    expect(order).toEqual([
      "hookC:stop",
      "partB:stop",
      "hookA:stop",
      "hookC:destroy",
      "partB:dispose",
      "hookA:destroy",
    ]);
    expect(manager.getComponents()).toHaveLength(3);
  });

  it("runs a dual-shape component exactly once per phase (hook wins)", async () => {
    const onStop = vi.fn();
    const stop = vi.fn();
    const onStart = vi.fn();
    const start = vi.fn();
    const manager = new LifecycleManager();

    manager.register({ name: "dual", onStop, stop, onStart, start } as never);

    await manager.start();
    await manager.stop();

    expect(onStart).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    expect(onStop).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
  });

  it("does not re-run onStart hooks on a double start", async () => {
    const onStart = vi.fn();
    const manager = new LifecycleManager();
    manager.register({ onStart });

    await manager.start();
    await manager.start();

    expect(onStart).toHaveBeenCalledOnce();
    expect(manager.getState()).toBe(LifecycleState.RUNNING);
  });

  it("does not run onStop hooks on components that never started", async () => {
    const onStop = vi.fn();
    const manager = new LifecycleManager();
    manager.register({ onStop });

    await manager.stop();

    expect(onStop).not.toHaveBeenCalled();
    expect(manager.getState()).toBe(LifecycleState.STOPPED);
  });

  it("retries initialize() from FAILED without re-running completed hooks", async () => {
    const first = vi.fn();
    let fail = true;
    const flaky = vi.fn(() => {
      if (fail) throw new Error("flaky");
    });
    const manager = new LifecycleManager();

    manager.register({ onInitialize: first });
    manager.register({ onInitialize: flaky });

    await expect(manager.initialize()).rejects.toThrow("flaky");
    expect(manager.getState()).toBe(LifecycleState.FAILED);

    fail = false;
    await manager.initialize();

    expect(manager.getState()).toBe(LifecycleState.INITIALIZED);
    expect(first).toHaveBeenCalledOnce();
    expect(flaky).toHaveBeenCalledTimes(2);
  });

  it("rejects registration once started", async () => {
    const manager = new LifecycleManager();
    await manager.start();

    expect(() => manager.register({ onStart: () => {} })).toThrow(
      InvalidStateError,
    );
  });

  it("names components from constructor or participant name", async () => {
    const logger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
    };
    class Cache {
      onStart(): void {}
    }
    const manager = new LifecycleManager({ logger: logger as never });
    manager.register(new Cache());
    manager.register({ name: "db", start: () => {} });
    manager.register({ onStart: () => {} });

    await manager.start();

    const components = logger.debug.mock.calls
      .filter(([message]) => message === "Running lifecycle start hook")
      .map(([, context]) => (context as { component: string }).component);

    expect(components).toEqual(["Cache", "db", "anonymous"]);
  });
});

describe("LifecycleScope", () => {
  it("destroys once and detaches from its parent", async () => {
    const parent = new LifecycleScope({ name: "parent" });
    const child = new LifecycleScope({ name: "child", parent });
    const onDestroy = vi.fn();
    child.register({ onDestroy });

    await parent.start();
    expect(parent.getChildren()).toEqual([child]);

    await child.destroy();
    await child.destroy();

    expect(onDestroy).toHaveBeenCalledOnce();
    expect(child.getState()).toBe(LifecycleScopeState.DESTROYED);
    expect(child.getParent()).toBeUndefined();
    expect(parent.getChildren()).toEqual([]);

    await parent.shutdown();
    expect(onDestroy).toHaveBeenCalledOnce();
  });

  it("stops never-started children without errors", async () => {
    const parent = new LifecycleScope({ name: "parent" });
    const child = new LifecycleScope({ name: "child", parent });
    const onStop = vi.fn();
    child.register({ onStop });

    await parent.initialize();
    await expect(parent.stop()).resolves.toBeUndefined();

    expect(onStop).not.toHaveBeenCalled();
    expect(child.getState()).toBe(LifecycleScopeState.STOPPED);
    expect(parent.getState()).toBe(LifecycleScopeState.STOPPED);
  });

  it("leaves FAILED when a stop aborts with continueOnShutdownError false", async () => {
    const scope = new LifecycleScope({
      name: "scope",
      continueOnShutdownError: false,
    });
    const first = vi.fn();
    scope.register({ onStop: first }, "first");
    scope.register(
      {
        onStop: () => {
          throw new Error("bad");
        },
      },
      "second",
    );

    await scope.start();
    await expect(scope.stop()).rejects.toThrow(AggregateError);

    expect(first).not.toHaveBeenCalled();
    expect(scope.getState()).toBe(LifecycleScopeState.FAILED);
  });

  it("runs children after own components on start and before on stop", async () => {
    const order: string[] = [];
    const parent = new LifecycleScope({ name: "parent" });
    const child = new LifecycleScope({ name: "child", parent });
    parent.register(hook("parent", order));
    child.register(hook("child", order));

    await parent.start();
    await parent.stop();

    expect(order).toEqual([
      "parent:initialize",
      "child:initialize",
      "parent:start",
      "child:start",
      "child:stop",
      "parent:stop",
    ]);
  });
});

describe("LifecycleRegistry", () => {
  it("rejects duplicate explicit names", () => {
    const registry = new LifecycleRegistry();
    registry.register({ onStart: () => {} }, "db");

    expect(() => registry.register({ onStart: () => {} }, "db")).toThrow(
      InvalidArgumentError,
    );
  });

  it("makes derived duplicate names unique", () => {
    const registry = new LifecycleRegistry();
    class Worker {
      onStart(): void {}
    }

    const first = registry.register(new Worker());
    const second = registry.register(new Worker());

    expect(first.name).toBe("Worker");
    expect(second.name).toBe("Worker#2");
    expect(registry.getByName("Worker#2")).toBe(second);
  });

  it("orders registrations and supports unregister", () => {
    const registry = new LifecycleRegistry();
    const a = registry.register({ name: "a" });
    const b = registry.register({ name: "b" });

    expect(registry.getAll().map((r) => r.name)).toEqual(["a", "b"]);
    expect(registry.getReverse().map((r) => r.name)).toEqual(["b", "a"]);
    expect(registry.unregister(a.id)).toBe(true);
    expect(registry.getById(b.id)?.isParticipant).toBe(true);
    expect(registry.size()).toBe(1);
  });
});
