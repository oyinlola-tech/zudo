import { describe, it, expect } from "vitest";
import {
  BaseModule,
  defineModule,
  moduleToDefinition,
  createModuleRegistry,
  createModuleLoader,
  createModuleLifecycleManager,
  createModuleDependencyGraph,
  resolveModuleStartupOrder,
  resolveModuleShutdownOrder,
  findModuleDependencyCycle,
  satisfiesModuleVersionConstraint,
  mergeModuleMetadata,
  createModuleMetadata,
  createConfigurationManager,
  InvalidModuleDefinitionError,
  DuplicateModuleError,
  MissingModuleDependencyError,
  InvalidModuleDependencyError,
  CircularModuleDependencyError,
  ModuleVersionMismatchError,
  ModuleInstantiationError,
  InvalidModuleInstanceError,
  InvalidModuleStateError,
  ModuleLifecycleError,
  ModuleLoadError,
  ModuleError,
  ModuleErrorCode,
  isModuleError,
  ModuleNotFoundError,
  ConsoleLogger,
} from "../src/index.js";
import type {
  Module,
  ModuleContext,
  ModuleRegistry,
  ModuleLoader,
  ConfigurationManager,
} from "../src/index.js";
import type { ApplicationContext } from "../src/application/applicationContext.context.js";

const quietLogger = new ConsoleLogger({ level: "fatal", structured: true });

async function createHarness(): Promise<{
  registry: ModuleRegistry;
  loader: ModuleLoader;
  configuration: ConfigurationManager;
}> {
  const registry = createModuleRegistry();
  const configuration = createConfigurationManager();
  await configuration.initialize();
  const loader = createModuleLoader(registry, {
    application: {} as ApplicationContext,
    configuration,
    logger: quietLogger,
  });
  return { registry, loader, configuration };
}

function simpleModule(
  id: string,
  extras: Partial<Module> & Record<string, unknown> = {},
): Module {
  return {
    id,
    name: id,
    ...extras,
  } as Module;
}

describe("defineModule", () => {
  it("rejects ids that differ from their trim()", () => {
    expect(() =>
      defineModule({
        id: " spaced ",
        name: "Spaced",
        factory: () => simpleModule(" spaced "),
      }),
    ).toThrow(InvalidModuleDefinitionError);
  });

  it("throws InvalidModuleDefinitionError for bad definitions", () => {
    expect(() =>
      defineModule({ id: "", name: "x", factory: () => simpleModule("") }),
    ).toThrow(InvalidModuleDefinitionError);

    expect(() =>
      defineModule({
        id: "a",
        name: "a",
        factory: undefined as never,
      }),
    ).toThrow(InvalidModuleDefinitionError);

    expect(() =>
      defineModule({
        id: "a",
        name: "a",
        factory: () => simpleModule("a"),
        dependencies: ["a"],
      }),
    ).toThrow(InvalidModuleDefinitionError);
  });

  it("no longer exposes a multiInstance option", () => {
    const definition = defineModule({
      id: "single",
      name: "single",
      factory: () => simpleModule("single"),
    });

    expect("multiInstance" in definition).toBe(false);
  });

  it("deep-freezes module options", () => {
    const definition = defineModule({
      id: "frozen",
      name: "frozen",
      factory: () => simpleModule("frozen"),
      options: { nested: { value: 1 }, list: [1, 2] },
    });

    expect(Object.isFrozen(definition.options)).toBe(true);
    expect(Object.isFrozen(definition.options?.nested)).toBe(true);
    expect(Object.isFrozen(definition.options?.list)).toBe(true);
  });
});

describe("Module registry", () => {
  it("throws DuplicateModuleError on duplicate registration", async () => {
    const { registry } = await createHarness();
    const definition = defineModule({
      id: "dup",
      name: "dup",
      factory: () => simpleModule("dup"),
    });
    registry.register(definition);
    expect(() => registry.register(definition)).toThrow(DuplicateModuleError);
  });

  it("throws ModuleNotFoundError from require()", async () => {
    const { registry } = await createHarness();
    expect(() => registry.require("ghost")).toThrow(ModuleNotFoundError);
  });

  it("refuses to replace a loaded module without replaceLoaded", async () => {
    const registry = createModuleRegistry({ allowReplacement: true });
    const configuration = createConfigurationManager();
    await configuration.initialize();
    const loader = createModuleLoader(registry, {
      application: {} as ApplicationContext,
      configuration,
      logger: quietLogger,
    });

    const definition = defineModule({
      id: "live",
      name: "live",
      factory: () => simpleModule("live"),
    });
    registry.register(definition);
    await loader.load("live");

    expect(() => registry.register(definition)).toThrow(
      InvalidModuleStateError,
    );

    const replaced = registry.register(definition, { replaceLoaded: true });
    expect(replaced.state).toBe("registered");
  });
});

describe("Module dependency graph", () => {
  it("resolves startup and shutdown orders topologically", () => {
    const graph = createModuleDependencyGraph([
      { id: "payments", dependencies: ["orders"] },
      { id: "orders", dependencies: ["users"] },
      { id: "users", dependencies: [] },
    ]);

    const startup = resolveModuleStartupOrder(graph);
    expect(startup.indexOf("users")).toBeLessThan(startup.indexOf("orders"));
    expect(startup.indexOf("orders")).toBeLessThan(startup.indexOf("payments"));

    const shutdown = resolveModuleShutdownOrder(graph);
    expect(shutdown).toEqual([...startup].reverse());
  });

  it("throws CircularModuleDependencyError with the cycle", () => {
    const graph = createModuleDependencyGraph([
      { id: "a", dependencies: ["b"] },
      { id: "b", dependencies: ["c"] },
      { id: "c", dependencies: ["a"] },
    ]);

    const cycle = findModuleDependencyCycle(graph);
    expect(cycle).toBeDefined();
    expect(cycle![0]).toBe(cycle![cycle!.length - 1]);

    expect(() => resolveModuleStartupOrder(graph)).toThrow(
      CircularModuleDependencyError,
    );
  });

  it("handles very deep graphs iteratively without stack overflow", () => {
    const nodes = [];
    for (let index = 0; index < 30000; index++) {
      nodes.push({
        id: `m${index}`,
        dependencies: index === 0 ? [] : [`m${index - 1}`],
      });
    }
    const graph = createModuleDependencyGraph(nodes);
    expect(findModuleDependencyCycle(graph)).toBeUndefined();
    const order = resolveModuleStartupOrder(graph);
    expect(order[0]).toBe("m0");
    expect(order.length).toBe(30000);
  });

  it("throws MissingModuleDependencyError naming the requiring module", () => {
    const graph = createModuleDependencyGraph([
      { id: "app", dependencies: ["missing-dep"] },
    ]);

    try {
      resolveModuleStartupOrder(graph);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MissingModuleDependencyError);
      const dependencyError = error as MissingModuleDependencyError;
      expect(dependencyError.moduleId).toBe("app");
      expect(dependencyError.dependencyId).toBe("missing-dep");
    }
  });

  it("checks dependency version constraints while building the graph", () => {
    expect(() =>
      createModuleDependencyGraph([
        {
          id: "consumer",
          dependencies: [{ id: "lib", optional: false, version: "^1.0.0" }],
          version: "1.0.0",
        },
        { id: "lib", dependencies: [], version: "2.0.0" },
      ]),
    ).toThrow(ModuleVersionMismatchError);

    expect(() =>
      createModuleDependencyGraph([
        {
          id: "consumer",
          dependencies: [{ id: "lib", optional: false, version: "^1.0.0" }],
        },
        { id: "lib", dependencies: [], version: "1.4.2" },
      ]),
    ).not.toThrow();
  });

  it("throws InvalidModuleDependencyError for malformed dependencies", () => {
    expect(() =>
      createModuleDependencyGraph([{ id: "a", dependencies: ["a"] }]),
    ).toThrow(InvalidModuleDependencyError);
    expect(() =>
      createModuleDependencyGraph([{ id: "a", dependencies: ["b", "b"] }]),
    ).toThrow(InvalidModuleDependencyError);
    expect(() =>
      createModuleDependencyGraph([
        { id: "a", dependencies: [{ id: "b", version: "banana" }] },
      ]),
    ).toThrow(InvalidModuleDependencyError);
    expect(() =>
      createModuleDependencyGraph([{ id: "a" }, { id: "a" }]),
    ).toThrow(InvalidModuleDefinitionError);

    try {
      createModuleDependencyGraph([{ id: "a", dependencies: ["a"] }]);
    } catch (error) {
      expect((error as ModuleError).code).toBe(
        ModuleErrorCode.INVALID_DEPENDENCY,
      );
      expect((error as ModuleError).moduleId).toBe("a");
      expect((error as ModuleError).dependencyId).toBe("a");
    }
  });

  it("implements simple semver constraint matching", () => {
    expect(satisfiesModuleVersionConstraint("1.2.3", "1.2.3")).toBe(true);
    expect(satisfiesModuleVersionConstraint("1.2.3", "1.2.4")).toBe(false);
    expect(satisfiesModuleVersionConstraint("^1.2.3", "1.9.0")).toBe(true);
    expect(satisfiesModuleVersionConstraint("^1.2.3", "2.0.0")).toBe(false);
    expect(satisfiesModuleVersionConstraint("^0.2.3", "0.3.0")).toBe(false);
    expect(satisfiesModuleVersionConstraint("^0.2.3", "0.2.9")).toBe(true);
    expect(satisfiesModuleVersionConstraint("~1.2.3", "1.2.9")).toBe(true);
    expect(satisfiesModuleVersionConstraint("~1.2.3", "1.3.0")).toBe(false);
    expect(satisfiesModuleVersionConstraint(">=1.2.3", "1.2.3")).toBe(true);
    expect(satisfiesModuleVersionConstraint(">=1.2.3", "2.0.0")).toBe(true);
    expect(satisfiesModuleVersionConstraint(">=1.2.3", "1.2.2")).toBe(false);
    expect(satisfiesModuleVersionConstraint("1.0.0", undefined)).toBe(false);
  });
});

describe("Module loader", () => {
  it("loads autoLoad:false modules that are required by loading modules", async () => {
    const { registry, loader } = await createHarness();

    registry.register(
      defineModule({
        id: "core-lib",
        name: "core-lib",
        autoLoad: false,
        factory: () => simpleModule("core-lib"),
      }),
    );
    registry.register(
      defineModule({
        id: "unused-lib",
        name: "unused-lib",
        autoLoad: false,
        factory: () => simpleModule("unused-lib"),
      }),
    );
    registry.register(
      defineModule({
        id: "app",
        name: "app",
        dependencies: ["core-lib"],
        factory: () => simpleModule("app", { dependencies: ["core-lib"] }),
      }),
    );

    const result = await loader.loadAll();
    const loadedIds = result.loaded.map((module) => module.id).sort();

    expect(loadedIds).toEqual(["app", "core-lib"]);
    expect(result.skipped).toEqual(["unused-lib"]);
    expect(loader.isLoaded("core-lib")).toBe(true);
    expect(loader.isLoaded("unused-lib")).toBe(false);
  });

  it("memoizes concurrent load() calls per module id", async () => {
    const { registry, loader } = await createHarness();
    let factoryCalls = 0;

    registry.register(
      defineModule({
        id: "slow",
        name: "slow",
        factory: () => {
          factoryCalls += 1;
          return simpleModule("slow");
        },
      }),
    );

    const [first, second] = await Promise.all([
      loader.load("slow"),
      loader.load("slow"),
    ]);

    expect(factoryCalls).toBe(1);
    expect(first).toBe(second);
  });

  it("throws ModuleInstantiationError when a factory fails", async () => {
    const { registry, loader } = await createHarness();

    registry.register(
      defineModule({
        id: "broken",
        name: "broken",
        factory: () => {
          throw new Error("factory exploded");
        },
      }),
    );

    await expect(loader.load("broken")).rejects.toBeInstanceOf(
      ModuleInstantiationError,
    );
    expect(registry.get("broken")?.state).toBe("failed");
  });

  it("throws MissingModuleDependencyError for unregistered required deps", async () => {
    const { registry, loader } = await createHarness();

    registry.register(
      defineModule({
        id: "needy",
        name: "needy",
        dependencies: ["ghost"],
        factory: () => simpleModule("needy", { dependencies: ["ghost"] }),
      }),
    );

    await expect(loader.load("needy")).rejects.toBeInstanceOf(
      MissingModuleDependencyError,
    );
  });

  it("hands modules a resolver view, never the live context map", async () => {
    const { registry, loader } = await createHarness();
    registry.register(
      defineModule({ id: "a", name: "a", factory: () => simpleModule("a") }),
    );
    registry.register(
      defineModule({
        id: "b",
        name: "b",
        dependencies: ["a"],
        factory: () => simpleModule("b"),
      }),
    );
    registry.register(
      defineModule({ id: "c", name: "c", factory: () => simpleModule("c") }),
    );
    await loader.loadAll();

    const context = loader.requireContext("b") as unknown as Record<
      string,
      unknown
    >;
    expect(context.moduleContexts).toBeUndefined();
    const own = Object.values(context);
    expect(own.some((value) => value instanceof Map)).toBe(false);

    const typed = loader.requireContext("b");
    expect(typed.hasModule("a")).toBe(true);
    /* Undeclared modules are invisible, not just inaccessible. */
    expect(typed.hasModule("c")).toBe(false);
    expect(() => typed.getModuleContext("c")).toThrow(
      MissingModuleDependencyError,
    );
  });

  it("throws taxonomy errors for invalid factory results", async () => {
    const { registry, loader } = await createHarness();
    registry.register(
      defineModule({
        id: "wrong",
        name: "wrong",
        factory: () => simpleModule("other"),
      }),
    );
    await expect(loader.load("wrong")).rejects.toBeInstanceOf(
      InvalidModuleInstanceError,
    );
    expect(registry.get("wrong")?.state).toBe("failed");

    const loadError = new ModuleLoadError("x", new Error("boom"));
    expect(loadError).toBeInstanceOf(ModuleError);
    expect(loadError.code).toBe(ModuleErrorCode.LOAD_FAILED);
    expect(loader.getContext("nope")).toBeUndefined();
    expect(() => loader.requireContext("nope")).toThrow(ModuleNotFoundError);
  });

  it("enforces declared-dependency access in module contexts", async () => {
    const { registry, loader } = await createHarness();

    registry.register(
      defineModule({
        id: "db",
        name: "db",
        factory: () => simpleModule("db"),
      }),
    );
    registry.register(
      defineModule({
        id: "api",
        name: "api",
        dependencies: ["db"],
        factory: () => simpleModule("api", { dependencies: ["db"] }),
      }),
    );

    await loader.loadAll();

    const apiContext = loader.requireContext("api");
    const dbContext = loader.requireContext("db");

    expect(apiContext.getModuleContext("db")).toBeDefined();
    expect(() => dbContext.getModuleContext("api")).toThrow(
      MissingModuleDependencyError,
    );
  });

  it("deep-freezes module options exposed on the context", async () => {
    const { registry, loader } = await createHarness();

    registry.register(
      defineModule({
        id: "opts",
        name: "opts",
        options: { nested: { flag: true } },
        factory: (options) => simpleModule("opts", { options }),
      }),
    );

    await loader.load("opts");
    const context = loader.requireContext("opts");
    expect(Object.isFrozen(context.options)).toBe(true);
    expect(Object.isFrozen(context.options.nested)).toBe(true);
  });
});

class RecordingModule extends BaseModule {
  public constructor(
    public readonly id: string,
    private readonly events: string[],
    dependencies: readonly string[] = [],
    private readonly failOn?: string,
  ) {
    super({ dependencies, version: "1.0.0" });
  }

  public get name(): string {
    return this.id;
  }

  public override async onInitialize(_context: ModuleContext): Promise<void> {
    if (this.failOn === "initialize") throw new Error(`${this.id} init failed`);
    this.events.push(`${this.id}:onInitialize`);
  }

  public override async onReady(_context: ModuleContext): Promise<void> {
    if (this.failOn === "start") throw new Error(`${this.id} start failed`);
    this.events.push(`${this.id}:onReady`);
  }

  public override async onShutdown(_context: ModuleContext): Promise<void> {
    this.events.push(`${this.id}:onShutdown`);
  }

  public override async onDestroy(_context: ModuleContext): Promise<void> {
    this.events.push(`${this.id}:onDestroy`);
  }
}

describe("Module lifecycle", () => {
  it("runs BaseModule documented hooks through the full lifecycle in order", async () => {
    const { registry, loader } = await createHarness();
    const events: string[] = [];

    const module = new RecordingModule("recorder", events);
    registry.register(moduleToDefinition(module));

    await loader.loadAll();
    const lifecycle = createModuleLifecycleManager(registry, loader);

    await lifecycle.initialize();
    await lifecycle.start();
    await lifecycle.stop();
    await lifecycle.destroy();

    expect(events).toEqual([
      "recorder:onInitialize",
      "recorder:onReady",
      "recorder:onShutdown",
      "recorder:onDestroy",
    ]);
  });

  it("invokes only the canonical Module contract hooks", async () => {
    const { registry, loader } = await createHarness();
    const events: string[] = [];

    registry.register(
      defineModule({
        id: "both",
        name: "both",
        factory: () =>
          simpleModule("both", {
            /* Legacy engine-style names are never invoked. */
            initialize: async () => {
              events.push("initialize");
            },
            start: async () => {
              events.push("start");
            },
            stop: async () => {
              events.push("stop");
            },
            destroy: async () => {
              events.push("destroy");
            },
            onInitialize: async () => {
              events.push("onInitialize");
            },
            onReady: async () => {
              events.push("onReady");
            },
            onShutdown: async () => {
              events.push("onShutdown");
            },
            onDestroy: async () => {
              events.push("onDestroy");
            },
          }),
      }),
    );

    await loader.loadAll();
    const lifecycle = createModuleLifecycleManager(registry, loader);
    await lifecycle.initialize();
    await lifecycle.start();
    await lifecycle.stop();
    await lifecycle.destroy();

    expect(events).toEqual([
      "onInitialize",
      "onReady",
      "onShutdown",
      "onDestroy",
    ]);
  });

  it("wraps hook failures in a ModuleLifecycleError from the core taxonomy", async () => {
    const { registry, loader } = await createHarness();
    const events: string[] = [];
    registry.register(
      moduleToDefinition(new RecordingModule("boom", events, [], "start")),
    );
    await loader.loadAll();
    const lifecycle = createModuleLifecycleManager(registry, loader);
    await lifecycle.initialize();

    let caught: unknown;
    try {
      await lifecycle.start();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ModuleLifecycleError);
    expect(caught).toBeInstanceOf(ModuleError);
    expect(isModuleError(caught)).toBe(true);
    expect((caught as ModuleLifecycleError).code).toBe(
      ModuleErrorCode.START_FAILED,
    );
    expect((caught as ModuleLifecycleError).moduleId).toBe("boom");
    expect((caught as ModuleLifecycleError).phase).toBe("starting");
  });

  it("unloadModule stops, destroys, and forgets a single module", async () => {
    const { registry, loader } = await createHarness();
    const events: string[] = [];
    const base = new RecordingModule("base", events);
    const dependent = new RecordingModule("dependent", events, ["base"]);
    registry.register(moduleToDefinition(base));
    registry.register(moduleToDefinition(dependent));
    await loader.loadAll();
    const lifecycle = createModuleLifecycleManager(registry, loader);
    await lifecycle.startApplication();

    /* A module with loaded dependents cannot be pulled out from under them. */
    await expect(lifecycle.unloadModule("base")).rejects.toMatchObject({
      code: ModuleErrorCode.OPERATION_NOT_ALLOWED,
    });

    events.length = 0;
    const result = await lifecycle.unloadModule("dependent");
    expect(events).toEqual(["dependent:onShutdown", "dependent:onDestroy"]);
    expect(result.completed).toEqual(["dependent"]);
    expect(registry.get("dependent")?.state).toBe("unloaded");
    expect(registry.get("dependent")?.instance).toBeUndefined();
    expect(loader.getContext("dependent")).toBeUndefined();
    expect(lifecycle.getState("dependent")).toBeUndefined();
    expect(lifecycle.isStarted("base")).toBe(true);

    /* Now base has no loaded dependents and can be unloaded too. */
    await lifecycle.unloadModule("base");
    expect(events).toContain("base:onShutdown");
    expect(events).toContain("base:onDestroy");
  });

  it("replaceModule shuts the replaced instance down before re-registering", async () => {
    const registry = createModuleRegistry({ allowReplacement: true });
    const configuration = createConfigurationManager();
    await configuration.initialize();
    const loader = createModuleLoader(registry, {
      application: {} as ApplicationContext,
      configuration,
      logger: quietLogger,
    });
    const events: string[] = [];
    const first = new RecordingModule("svc", events);
    registry.register(moduleToDefinition(first));
    await loader.loadAll();
    const lifecycle = createModuleLifecycleManager(registry, loader);
    await lifecycle.startApplication();

    const second = new RecordingModule("svc", events);
    const registration = await lifecycle.replaceModule(
      moduleToDefinition(second),
    );
    expect(events).toContain("svc:onShutdown");
    expect(events).toContain("svc:onDestroy");
    expect(registration.state).toBe("registered");
    expect(registration.instance).toBeUndefined();

    events.length = 0;
    await loader.loadAll();
    await lifecycle.startApplication();
    expect(loader.getContext("svc")).toBeDefined();
    expect(registry.get("svc")?.instance).toBe(second);
    expect(events).toEqual(["svc:onInitialize", "svc:onReady"]);
  });

  it("rolls back already-initialized modules when initialization fails", async () => {
    const { registry, loader } = await createHarness();
    const events: string[] = [];

    const stable = new RecordingModule("stable", events);
    const failing = new RecordingModule(
      "failing",
      events,
      ["stable"],
      "initialize",
    );

    registry.register(moduleToDefinition(stable));
    registry.register(moduleToDefinition(failing));

    await loader.loadAll();
    const lifecycle = createModuleLifecycleManager(registry, loader);

    await expect(lifecycle.initialize()).rejects.toBeInstanceOf(
      ModuleLifecycleError,
    );

    /* The completed subset was destroyed in reverse order. */
    expect(events).toContain("stable:onInitialize");
    expect(events).toContain("stable:onDestroy");
    expect(lifecycle.isDestroyed("stable")).toBe(true);
  });

  it("stops and destroys started modules when start fails", async () => {
    const { registry, loader } = await createHarness();
    const events: string[] = [];

    const stable = new RecordingModule("stable", events);
    const failing = new RecordingModule("failing", events, ["stable"], "start");

    registry.register(moduleToDefinition(stable));
    registry.register(moduleToDefinition(failing));

    await loader.loadAll();
    const lifecycle = createModuleLifecycleManager(registry, loader);

    await lifecycle.initialize();
    await expect(lifecycle.start()).rejects.toBeInstanceOf(
      ModuleLifecycleError,
    );

    expect(events).toContain("stable:onShutdown");
    expect(events).toContain("stable:onDestroy");
  });

  it("skips dependents whose dependencies failed and reports the reason", async () => {
    const { registry, loader } = await createHarness();
    const events: string[] = [];

    const failing = new RecordingModule("failing", events, [], "initialize");
    const dependent = new RecordingModule("dependent", events, ["failing"]);

    registry.register(moduleToDefinition(failing));
    registry.register(moduleToDefinition(dependent));

    await loader.loadAll();
    const lifecycle = createModuleLifecycleManager(registry, loader, {
      continueOnInitializeError: true,
    });

    const result = await lifecycle.initialize();

    expect(result.failed).toContain("failing");
    expect(result.completed).not.toContain("dependent");
    expect(
      result.skipped.some(
        (skip) =>
          skip.moduleId === "dependent" && skip.reason.includes("failing"),
      ),
    ).toBe(true);
    expect(events).not.toContain("dependent:onInitialize");
  });

  it("allows destroy from failed and started states", async () => {
    const { registry, loader } = await createHarness();
    const events: string[] = [];

    const failing = new RecordingModule("failing", events, [], "start");

    registry.register(moduleToDefinition(failing));
    await loader.loadAll();

    const lifecycle = createModuleLifecycleManager(registry, loader, {
      continueOnStartError: true,
    });

    await lifecycle.initialize();
    await lifecycle.start();
    expect(lifecycle.getState("failing")?.phase).toBe("failed");

    const destroyed = await lifecycle.destroy();
    expect(destroyed.completed).toContain("failing");
    expect(events).toContain("failing:onDestroy");
  });

  it("reports genuinely skipped modules in the result", async () => {
    const { registry, loader } = await createHarness();
    const events: string[] = [];

    registry.register(moduleToDefinition(new RecordingModule("solo", events)));
    await loader.loadAll();
    const lifecycle = createModuleLifecycleManager(registry, loader);

    /* start without initialize: module cannot enter start. */
    const result = await lifecycle.start();
    expect(result.completed).toHaveLength(0);
    expect(result.skipped.some((skip) => skip.moduleId === "solo")).toBe(true);
  });

  it("prunes lifecycle state for unregistered modules", async () => {
    const { registry, loader } = await createHarness();
    const events: string[] = [];

    registry.register(moduleToDefinition(new RecordingModule("temp", events)));
    await loader.loadAll();
    const lifecycle = createModuleLifecycleManager(registry, loader);
    await lifecycle.initialize();
    expect(lifecycle.getState("temp")).toBeDefined();

    registry.unregister("temp");
    await lifecycle.destroy();
    expect(lifecycle.getState("temp")).toBeUndefined();
  });
});

describe("Module metadata", () => {
  it("merge does not clobber defined values with undefined", () => {
    const base = createModuleMetadata({
      description: "base description",
      author: "author",
    });
    const override = createModuleMetadata({ category: "domain" });

    const merged = mergeModuleMetadata(base, override);
    expect(merged.description).toBe("base description");
    expect(merged.author).toBe("author");
    expect(merged.category).toBe("domain");
  });

  it("still lets override win for defined values", () => {
    const merged = mergeModuleMetadata(
      createModuleMetadata({ description: "old" }),
      createModuleMetadata({ description: "new" }),
    );
    expect(merged.description).toBe("new");
  });
});
