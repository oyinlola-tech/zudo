import { describe, it, expect } from "vitest";
import {
  createContainer,
  createToken,
  ContainerScope,
  ContainerRegistry,
  AsyncProviderError,
  CaptiveDependencyError,
  DependencyResolutionError,
  MaxResolutionDepthError,
  ScopedResolutionError,
} from "../src/index.js";
import {
  CircularDependencyError,
  DuplicateRegistrationError,
  ProviderResolutionError,
  RegistrationNotFoundError,
} from "@zudojs/errors";

const LOGGER = createToken<{ log: (m: string) => void }>("logger");
const DB = createToken<{ query: () => string }>("db");
const API = createToken<{ get: (id: string) => string }>("api");
const NOT_REGISTERED = createToken<unknown>("missing");

class DisposableService {
  disposed = false;
  disposeCount = 0;
  dispose(): void {
    this.disposed = true;
    this.disposeCount += 1;
  }
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Container basics", () => {
  it("creates a container with default options", () => {
    const c = createContainer();
    expect(c).toBeDefined();
    expect(c.isDisposed()).toBe(false);
  });

  it("accepts custom options", () => {
    const c = createContainer({ name: "my-container" });
    expect(c.options.name).toBe("my-container");
  });

  it("registers and resolves a value", () => {
    const c = createContainer();
    const logger = { log: () => {} };
    c.registerValue(LOGGER, logger);
    expect(c.resolve(LOGGER)).toBe(logger);
  });

  it("registerValue always registers as a singleton (scope override documented)", () => {
    const c = createContainer();
    const logger = { log: () => {} };
    c.registerValue(LOGGER, logger, { scope: ContainerScope.TRANSIENT });
    expect(c.getRegistration(LOGGER)?.scope).toBe(ContainerScope.SINGLETON);
    expect(c.resolve(LOGGER)).toBe(c.resolve(LOGGER));
  });

  it("instantiates a registered class on resolution", () => {
    const c = createContainer();
    class Db {
      query(): string {
        return "ok";
      }
    }
    c.registerClass(DB, Db);
    const db = c.resolve(DB);
    expect(db).toBeInstanceOf(Db);
    expect(db.query()).toBe("ok");
  });

  it("invokes a transient factory each time", () => {
    const c = createContainer();
    let n = 0;
    c.registerFactory(API, () => {
      n++;
      return { get: (id: string) => id };
    });
    c.resolve(API);
    c.resolve(API);
    expect(n).toBe(2);
  });

  it("resolveMany resolves multiple tokens, typed per token", () => {
    const c = createContainer();
    c.registerValue(LOGGER, { log: () => {} });
    c.registerValue(DB, { query: () => "ok" });
    const [logger, db] = c.resolveMany([LOGGER, DB]);
    // Heterogeneous tokens keep their own types (compile-time check).
    logger.log("x");
    expect(db.query()).toBe("ok");
  });

  it("throws on duplicate registration by default", () => {
    const c = createContainer();
    c.registerValue(LOGGER, { log: () => {} });
    expect(() => c.registerValue(LOGGER, { log: () => {} })).toThrow(
      DuplicateRegistrationError,
    );
  });

  it("allows duplicate registration with allowDuplicates", () => {
    const c = createContainer({ registry: { allowDuplicates: true } });
    c.registerValue("cfg", 1);
    c.registerValue("cfg", 2);
    expect(c.resolve("cfg")).toBe(2);
  });
});

describe("Constructor injection", () => {
  it("resolves inject tokens and passes them to the constructor", () => {
    const c = createContainer();
    class Db {
      query(): string {
        return "rows";
      }
    }
    class Api {
      constructor(
        public db: Db,
        public label: string,
      ) {}
      get(id: string): string {
        return `${this.label}:${this.db.query()}:${id}`;
      }
    }
    c.registerClass(DB, Db, { scope: ContainerScope.SINGLETON });
    c.registerValue("label", "api");
    c.registerClass(API, Api, { inject: [DB, "label"] });
    const api = c.resolve(API) as Api;
    expect(api.get("1")).toBe("api:rows:1");
    expect(api.db).toBe(c.resolve(DB));
  });

  it("keeps zero-argument construction as the default", () => {
    const c = createContainer();
    class Standalone {
      value = 42;
    }
    c.registerClass("standalone", Standalone);
    expect((c.resolve("standalone") as Standalone).value).toBe(42);
  });
});

describe("Singleton semantics", () => {
  it("returns the same instance at root and inside scopes", () => {
    const c = createContainer();
    let n = 0;
    c.registerFactory(
      DB,
      () => {
        n++;
        return { query: () => "ok" };
      },
      [],
      { scope: ContainerScope.SINGLETON },
    );
    const root = c.resolve(DB);
    const scope = c.createScope();
    expect(scope.resolve(DB)).toBe(root);
    const scope2 = c.createScope();
    expect(scope2.resolve(DB)).toBe(root);
    expect(n).toBe(1);
  });

  it("a singleton first resolved inside a scope is shared with the root", () => {
    const c = createContainer();
    c.register(
      DB,
      { useFactory: () => ({ query: () => "x" }) },
      {
        scope: ContainerScope.SINGLETON,
      },
    );
    const scope = c.createScope();
    const fromScope = scope.resolve(DB);
    expect(c.resolve(DB)).toBe(fromScope);
  });

  it("caches undefined-producing singleton factories (cache.has semantics)", () => {
    const c = createContainer();
    let calls = 0;
    c.registerFactory(
      "maybe",
      () => {
        calls++;
        return undefined;
      },
      [],
      { scope: ContainerScope.SINGLETON },
    );
    expect(c.resolve("maybe")).toBeUndefined();
    expect(c.resolve("maybe")).toBeUndefined();
    expect(calls).toBe(1);
  });

  it("tracks singletons created transitively as dependencies", async () => {
    const c = createContainer();
    c.registerFactory("dep", () => new DisposableService(), [], {
      scope: ContainerScope.SINGLETON,
    });
    c.registerFactory("top", (dep) => ({ dep }), ["dep"], {
      scope: ContainerScope.SINGLETON,
    });
    const top = c.resolve("top") as { dep: DisposableService };
    expect(top.dep).toBe(c.resolve("dep"));
    await c.dispose();
    expect(top.dep.disposed).toBe(true);
  });

  it("evicts and disposes a transitively created singleton on replace", async () => {
    const c = createContainer();
    c.registerFactory("dep", () => new DisposableService(), [], {
      scope: ContainerScope.SINGLETON,
    });
    c.registerFactory("top", (dep) => ({ dep }), ["dep"], {
      scope: ContainerScope.SINGLETON,
    });
    const top = c.resolve("top") as { dep: DisposableService };
    c.replace(
      "dep",
      { useFactory: () => new DisposableService() },
      {
        scope: ContainerScope.SINGLETON,
      },
    );
    await tick();
    expect(top.dep.disposed).toBe(true);
    expect(c.resolve("dep")).not.toBe(top.dep);
  });

  it("rejects async factories for singleton and scoped registrations", () => {
    const c = createContainer();
    c.registerFactory("single", () => Promise.resolve(1), [], {
      scope: ContainerScope.SINGLETON,
    });
    c.registerFactory("scoped", () => Promise.resolve(1), [], {
      scope: ContainerScope.SCOPED,
    });
    c.registerFactory("transient", () => Promise.resolve(1));
    expect(() => c.resolve("single")).toThrow(AsyncProviderError);
    expect(() => c.resolve("single")).toThrow(/returned a Promise/);
    expect(() => c.createScope().resolve("scoped")).toThrow(AsyncProviderError);
    // Transient results are handed straight to the caller, so a Promise is fine.
    expect(c.resolve("transient")).toBeInstanceOf(Promise);
  });

  it("does not double-dispose a singleton resolved multiple times", async () => {
    const c = createContainer();
    c.registerFactory("svc", () => new DisposableService(), [], {
      scope: ContainerScope.SINGLETON,
    });
    const svc = c.resolve("svc") as DisposableService;
    c.resolve("svc");
    c.resolve("svc");
    await c.dispose();
    expect(svc.disposeCount).toBe(1);
  });
});

describe("Scoped semantics", () => {
  const SCOPED = createToken<{ id: number }>("scoped-dep");

  function registerScoped(c = createContainer()) {
    let n = 0;
    c.register(
      SCOPED,
      { useFactory: () => ({ id: ++n }) },
      {
        scope: ContainerScope.SCOPED,
      },
    );
    return c;
  }

  it("throws a clear error when a scoped token is resolved at the root", () => {
    const c = registerScoped();
    expect(() => c.resolve(SCOPED)).toThrow(ScopedResolutionError);
    expect(() => c.resolve(SCOPED)).toThrow(
      /cannot be resolved outside a scope/,
    );
  });

  it("never writes scoped instances to the singleton cache", () => {
    const c = registerScoped();
    const scope = c.createScope();
    scope.resolve(SCOPED);
    // Root resolution must still refuse, not serve the scope's instance.
    expect(() => c.resolve(SCOPED)).toThrow(ScopedResolutionError);
  });

  it("caches one instance per scope, distinct across scopes", () => {
    const c = registerScoped();
    const s1 = c.createScope();
    const s2 = c.createScope();
    const a1 = s1.resolve(SCOPED);
    const a2 = s1.resolve(SCOPED);
    const b1 = s2.resolve(SCOPED);
    expect(a1).toBe(a2);
    expect(b1).not.toBe(a1);
  });

  it("a transient depending on a scoped token still throws at root", () => {
    const c = registerScoped();
    c.registerFactory("consumer", (dep) => ({ dep }), [SCOPED]);
    expect(() => c.resolve("consumer")).toThrow(ScopedResolutionError);
  });

  it("tracks and disposes scoped instances created transitively", async () => {
    const c = createContainer();
    c.registerFactory("dep", () => new DisposableService(), [], {
      scope: ContainerScope.SCOPED,
    });
    c.registerFactory("top", (dep) => ({ dep }), ["dep"], {
      scope: ContainerScope.SCOPED,
    });
    const scope = c.createScope();
    const top = scope.resolve("top") as { dep: DisposableService };
    expect(scope.resolve("dep")).toBe(top.dep);
    await scope.dispose();
    expect(top.dep.disposed).toBe(true);
  });
});

describe("Nested scopes", () => {
  const SCOPED = createToken<DisposableService>("nested-scoped");

  function build() {
    const c = createContainer();
    c.registerFactory(SCOPED, () => new DisposableService(), [], {
      scope: ContainerScope.SCOPED,
    });
    return c;
  }

  it("scope.createScope creates a true child whose parent is the scope", () => {
    const c = build();
    const outer = c.createScope({ name: "outer" });
    const inner = outer.createScope({ name: "inner" });
    expect(inner.getParent()).toBe(outer);
    expect(outer.getParent()).toBe(c);
    expect(inner.getContainer()).toBe(c);
  });

  it("a child sees scoped instances created by its ancestors", () => {
    const c = build();
    const outer = c.createScope();
    const fromOuter = outer.resolve(SCOPED);
    const inner = outer.createScope();
    expect(inner.resolve(SCOPED)).toBe(fromOuter);
  });

  it("instances created in a child stay private to the child", async () => {
    const c = build();
    const outer = c.createScope();
    const inner = outer.createScope();
    const fromInner = inner.resolve(SCOPED);
    const fromOuter = outer.resolve(SCOPED);
    expect(fromOuter).not.toBe(fromInner);
    await inner.dispose();
    expect(fromInner.disposed).toBe(true);
    expect(fromOuter.disposed).toBe(false);
  });

  it("disposing a scope disposes its children first", async () => {
    const c = build();
    const outer = c.createScope();
    const inner = outer.createScope();
    const fromInner = inner.resolve(SCOPED);
    const fromOuter = outer.resolve(SCOPED);
    await outer.dispose();
    expect(inner.isDisposed()).toBe(true);
    expect(fromInner.disposed).toBe(true);
    expect(fromOuter.disposed).toBe(true);
    expect(() => inner.resolve(SCOPED)).toThrow(/disposed/);
  });

  it("container.dispose cascades through nested scopes", async () => {
    const c = build();
    const inner = c.createScope().createScope();
    const svc = inner.resolve(SCOPED);
    await c.dispose();
    expect(inner.isDisposed()).toBe(true);
    expect(svc.disposed).toBe(true);
  });

  it("a child refuses to create scopes or resolve once its parent is disposed", async () => {
    const c = build();
    const outer = c.createScope();
    const inner = outer.createScope();
    await outer.dispose();
    expect(() => inner.createScope()).toThrow(/disposed/);
  });
});

describe("Captive dependencies", () => {
  const SCOPED = createToken<object>("scoped");
  const SINGLETON = createToken<object>("singleton-consumer");

  function build() {
    const c = createContainer();
    c.register(
      SCOPED,
      { useFactory: () => ({}) },
      {
        scope: ContainerScope.SCOPED,
      },
    );
    c.register(
      SINGLETON,
      { useFactory: (dep) => ({ dep }), inject: [SCOPED] },
      { scope: ContainerScope.SINGLETON },
    );
    return c;
  }

  it("throws when a singleton resolved in a scope depends on a scoped token", () => {
    const c = build();
    const scope = c.createScope();
    expect(() => scope.resolve(SINGLETON)).toThrow(CaptiveDependencyError);
    expect(() => scope.resolve(SINGLETON)).toThrow(/Captive dependency/);
  });

  it("throws when a root singleton depends on a scoped token", () => {
    const c = build();
    expect(() => c.resolve(SINGLETON)).toThrow(CaptiveDependencyError);
  });
});

describe("Lifecycle and disposal", () => {
  it("scope disposal disposes scoped instances but never singletons", async () => {
    const c = createContainer();
    c.registerFactory("single", () => new DisposableService(), [], {
      scope: ContainerScope.SINGLETON,
    });
    c.registerFactory("scoped", () => new DisposableService(), [], {
      scope: ContainerScope.SCOPED,
    });
    const scope = c.createScope();
    const single = scope.resolve("single") as DisposableService;
    const scoped = scope.resolve("scoped") as DisposableService;
    await scope.dispose();
    expect(scoped.disposed).toBe(true);
    expect(single.disposed).toBe(false);
    // The singleton is still served from the root cache afterwards.
    expect(c.resolve("single")).toBe(single);
  });

  it("does not track or dispose transient instances (callers own them)", async () => {
    const c = createContainer();
    c.registerFactory("t", () => new DisposableService());
    const first = c.resolve("t") as DisposableService;
    const second = c.resolve("t") as DisposableService;
    const scope = c.createScope();
    const third = scope.resolve("t") as DisposableService;
    await scope.dispose();
    await c.dispose();
    expect(first.disposed).toBe(false);
    expect(second.disposed).toBe(false);
    expect(third.disposed).toBe(false);
  });

  it("disposes singletons in reverse creation order", async () => {
    const c = createContainer();
    const order: string[] = [];
    for (const name of ["a", "b", "c"]) {
      c.registerFactory(name, () => ({ dispose: () => order.push(name) }), [], {
        scope: ContainerScope.SINGLETON,
      });
    }
    c.resolve("a");
    c.resolve("b");
    c.resolve("c");
    await c.dispose();
    expect(order).toEqual(["c", "b", "a"]);
  });

  it("disposes dependencies after their dependents, even when re-created", async () => {
    const c = createContainer();
    const order: string[] = [];
    const make = (name: string) => ({ dispose: () => order.push(name) });
    c.registerFactory("dep", () => make("dep"), [], {
      scope: ContainerScope.SINGLETON,
    });
    c.registerFactory("consumer", () => make("consumer"), ["dep"], {
      scope: ContainerScope.SINGLETON,
    });
    c.resolve("consumer"); // creates dep, then consumer
    c.replace(
      "dep",
      { useFactory: () => make("dep2") },
      {
        scope: ContainerScope.SINGLETON,
      },
    );
    await tick();
    c.resolve("dep"); // dep2 created after consumer -> disposed before it
    await c.dispose();
    expect(order).toEqual(["dep", "dep2", "consumer"]);
  });

  it("recognizes Symbol.dispose and Symbol.asyncDispose", async () => {
    const c = createContainer();
    const sync = {
      closed: false,
      [Symbol.dispose]() {
        this.closed = true;
      },
    };
    const async = {
      closed: false,
      async [Symbol.asyncDispose]() {
        this.closed = true;
      },
    };
    c.registerValue("sync", sync);
    c.registerValue("async", async);
    c.resolve("sync");
    c.resolve("async");
    await c.dispose();
    expect(sync.closed).toBe(true);
    expect(async.closed).toBe(true);
  });

  it("autoDispose:false releases references without disposing", async () => {
    const c = createContainer({ autoDispose: false });
    c.registerFactory("svc", () => new DisposableService(), [], {
      scope: ContainerScope.SINGLETON,
    });
    const svc = c.resolve("svc") as DisposableService;
    await c.dispose();
    expect(svc.disposed).toBe(false);
    expect(c.isDisposed()).toBe(true);
  });

  it("marks the container disposed even when disposal fails, reporting failures", async () => {
    const c = createContainer();
    c.registerValue("bad", {
      dispose() {
        throw new Error("boom");
      },
    });
    c.resolve("bad");
    await expect(c.dispose()).rejects.toBeInstanceOf(AggregateError);
    expect(c.isDisposed()).toBe(true);
    await expect(c.dispose()).resolves.toBeUndefined();
  });

  it("clearSingletons disposes and evicts cached singletons", async () => {
    const c = createContainer();
    let n = 0;
    c.registerFactory(
      "svc",
      () => {
        n++;
        return new DisposableService();
      },
      [],
      { scope: ContainerScope.SINGLETON },
    );
    const first = c.resolve("svc") as DisposableService;
    await c.clearSingletons();
    expect(first.disposed).toBe(true);
    const second = c.resolve("svc") as DisposableService;
    expect(second).not.toBe(first);
    expect(n).toBe(2);
  });
});

describe("Dispose-then-resolve", () => {
  it("container.resolve throws after dispose", async () => {
    const c = createContainer();
    c.registerValue(LOGGER, { log: () => {} });
    await c.dispose();
    expect(() => c.resolve(LOGGER)).toThrow(/has already been disposed/);
  });

  it("scope.resolve throws after scope dispose", async () => {
    const c = createContainer();
    c.registerValue(LOGGER, { log: () => {} });
    const scope = c.createScope();
    await scope.dispose();
    expect(() => scope.resolve(LOGGER)).toThrow(/has already been disposed/);
  });

  it("scope.dispose is idempotent", async () => {
    const c = createContainer();
    c.registerFactory("scoped", () => new DisposableService(), [], {
      scope: ContainerScope.SCOPED,
    });
    const scope = c.createScope();
    const svc = scope.resolve("scoped") as DisposableService;
    await scope.dispose();
    await scope.dispose();
    expect(svc.disposeCount).toBe(1);
  });

  it("scope.resolve throws after the parent container is disposed", async () => {
    const c = createContainer();
    c.registerValue(LOGGER, { log: () => {} });
    const scope = c.createScope();
    await c.dispose();
    // Container disposal disposes live scopes, so the scope's guard fires.
    expect(() => scope.resolve(LOGGER)).toThrow(/disposed/);
  });

  it("container.dispose disposes live scopes first", async () => {
    const c = createContainer();
    c.registerFactory("scoped", () => new DisposableService(), [], {
      scope: ContainerScope.SCOPED,
    });
    const scope = c.createScope();
    const svc = scope.resolve("scoped") as DisposableService;
    await c.dispose();
    expect(svc.disposed).toBe(true);
    expect(scope.isDisposed()).toBe(true);
  });

  it("createScope throws when scopes are disabled", () => {
    const c = createContainer({ allowScopes: false });
    expect(() => c.createScope()).toThrow(/scopes are disabled/);
  });
});

describe("Registry mutation and singleton eviction", () => {
  it("replace evicts and disposes the stale cached singleton", async () => {
    const c = createContainer();
    c.registerFactory("svc", () => new DisposableService(), [], {
      scope: ContainerScope.SINGLETON,
    });
    const first = c.resolve("svc") as DisposableService;
    c.replace(
      "svc",
      { useFactory: () => new DisposableService() },
      {
        scope: ContainerScope.SINGLETON,
      },
    );
    await tick();
    expect(first.disposed).toBe(true);
    const second = c.resolve("svc") as DisposableService;
    expect(second).not.toBe(first);
  });

  it("remove evicts the cached singleton so re-registration takes effect", async () => {
    const c = createContainer();
    c.registerValue("cfg", { v: 1 });
    const first = c.resolve("cfg");
    expect(c.remove("cfg")).toBe(true);
    await tick();
    c.registerValue("cfg", { v: 2 });
    const second = c.resolve("cfg") as { v: number };
    expect(second).not.toBe(first);
    expect(second.v).toBe(2);
  });

  it("clearRegistrations evicts all cached singletons", async () => {
    const c = createContainer();
    c.registerFactory("svc", () => new DisposableService(), [], {
      scope: ContainerScope.SINGLETON,
    });
    const svc = c.resolve("svc") as DisposableService;
    c.clearRegistrations();
    await tick();
    expect(svc.disposed).toBe(true);
    expect(c.has("svc")).toBe(false);
    expect(() => c.resolve("svc")).toThrow(RegistrationNotFoundError);
  });
});

describe("snapshot / restoreSnapshot", () => {
  it("restores a previous registration set wholesale", () => {
    const c = createContainer();
    c.registerValue("a", 1);
    const snap = c.snapshot();
    c.registerValue("b", 2);
    expect(c.has("b")).toBe(true);
    c.restoreSnapshot(snap);
    expect(c.has("a")).toBe(true);
    expect(c.has("b")).toBe(false);
    expect(c.resolve("a")).toBe(1);
  });

  it("evicts cached singletons on restore", async () => {
    const c = createContainer();
    let n = 0;
    c.registerFactory("svc", () => ({ n: ++n }), [], {
      scope: ContainerScope.SINGLETON,
    });
    const snap = c.snapshot();
    expect((c.resolve("svc") as { n: number }).n).toBe(1);
    c.restoreSnapshot(snap);
    await tick();
    expect((c.resolve("svc") as { n: number }).n).toBe(2);
  });

  it("rejects duplicate tokens in a restore set", () => {
    const c = createContainer();
    c.registerValue("a", 1);
    const [reg] = c.snapshot();
    expect(reg).toBeDefined();
    expect(() => c.restoreSnapshot([reg!, reg!])).toThrow(
      DuplicateRegistrationError,
    );
  });
});

describe("Resolution guards", () => {
  it("enforces maxResolutionDepth with a clear error", () => {
    const c = createContainer({ resolution: { maxResolutionDepth: 5 } });
    for (let i = 0; i < 9; i++) {
      c.registerFactory(`t${i}`, (dep) => ({ dep }), [`t${i + 1}`]);
    }
    c.registerValue("t9", "leaf");
    try {
      c.resolve("t0");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MaxResolutionDepthError);
      const e = error as MaxResolutionDepthError;
      expect(e.message).toContain("t5");
      expect(e.message).toContain("depth 6");
      expect(e.message).toContain("Maximum resolution depth of 5");
    }
  });

  it("detects circular dependencies with the full chain", () => {
    const c = createContainer();
    c.registerFactory("a", (b) => ({ b }), ["b"]);
    c.registerFactory("b", (a) => ({ a }), ["a"]);
    try {
      c.resolve("a");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(CircularDependencyError);
      expect((error as CircularDependencyError).chain).toEqual(["a", "b", "a"]);
    }
  });

  it("falls back to depth limiting when circular detection is off", () => {
    const c = createContainer({
      resolution: { detectCircularDependencies: false, maxResolutionDepth: 10 },
    });
    c.registerFactory("a", (b) => ({ b }), ["b"]);
    c.registerFactory("b", (a) => ({ a }), ["a"]);
    expect(() => c.resolve("a")).toThrow(MaxResolutionDepthError);
  });

  it("wraps provider failures with token, cause and chain attached", () => {
    const c = createContainer();
    c.registerFactory("a", (b) => ({ b }), ["b"]);
    const cause = new Error("kaboom");
    c.registerFactory("b", () => {
      throw cause;
    });
    try {
      c.resolve("a");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderResolutionError);
      expect(error).toBeInstanceOf(DependencyResolutionError);
      const e = error as DependencyResolutionError;
      expect(e.token).toBe("b");
      expect(e.chain).toEqual(["a", "b"]);
      expect(e.cause).toBe(cause);
      expect(e.message).toContain("Failed to resolve b");
      expect(e.message).toContain("kaboom");
      expect(e.message).toContain("chain: a -> b");
    }
  });

  it("wraps missing-dependency failures so the chain is visible", () => {
    const c = createContainer();
    c.registerFactory("a", (dep) => ({ dep }), [NOT_REGISTERED]);
    try {
      c.resolve("a");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderResolutionError);
      expect((error as Error).message).toContain("chain: a");
    }
  });
});

describe("useExisting", () => {
  it("aliases to an existing registration", () => {
    const c = createContainer();
    const db = { query: () => "ok" };
    c.registerValue(DB, db);
    c.registerExisting("alias", DB);
    expect(c.resolve("alias")).toBe(db);
  });

  it("fails with a clear error when the target is missing", () => {
    const c = createContainer();
    c.registerExisting("alias", "nope");
    expect(() => c.resolve("alias")).toThrow(/useExisting target "nope"/);
  });
});

describe("Auto-registration and freezing", () => {
  class AutoService {
    ping(): string {
      return "pong";
    }
  }

  it("auto-registers unregistered classes when mutable", () => {
    const c = createContainer();
    const svc = c.resolve(AutoService);
    expect(svc).toBeInstanceOf(AutoService);
    expect(c.has(AutoService)).toBe(true);
  });

  it("resolves unregistered classes EPHEMERALLY when registrations are frozen", () => {
    const c = createContainer({ freezeRegistrations: true });
    c.start();
    const svc = c.resolve(AutoService);
    expect(svc).toBeInstanceOf(AutoService);
    expect(c.has(AutoService)).toBe(false);
  });

  it("honors autoRegisterClasses: false", () => {
    const c = createContainer({ resolution: { autoRegisterClasses: false } });
    expect(c.canResolve(AutoService)).toBe(false);
    expect(() => c.resolve(AutoService)).toThrow(RegistrationNotFoundError);
    expect(c.resolveOptional(AutoService)).toBeUndefined();
  });

  it("freezes registrations on first resolve (implicit start)", () => {
    const c = createContainer({ freezeRegistrations: true });
    c.registerValue(LOGGER, { log: () => {} });
    expect(c.isStarted()).toBe(false);
    c.resolve(LOGGER);
    expect(c.isStarted()).toBe(true);
    expect(() => c.registerValue(DB, { query: () => "" })).toThrow(/frozen/);
  });
});

describe("resolveOptional / canResolve", () => {
  it("returns undefined for unregistered tokens", () => {
    const c = createContainer();
    expect(c.resolveOptional(NOT_REGISTERED)).toBeUndefined();
  });

  it("returns the value for registered tokens", () => {
    const c = createContainer();
    c.registerValue(LOGGER, { log: () => {} });
    expect(c.resolveOptional(LOGGER)).toBeDefined();
  });

  it("rethrows failures other than missing registrations", () => {
    const c = createContainer();
    c.registerFactory("broken", () => {
      throw new Error("nope");
    });
    expect(() => c.resolveOptional("broken")).toThrow(ProviderResolutionError);
  });

  it("has() and canResolve() reflect registration state", () => {
    const c = createContainer();
    c.registerValue(LOGGER, { log: () => {} });
    expect(c.has(LOGGER)).toBe(true);
    expect(c.has(NOT_REGISTERED)).toBe(false);
    expect(c.canResolve(NOT_REGISTERED)).toBe(false);
  });
});

describe("ContainerRegistry listeners", () => {
  it("surfaces listener errors as an AggregateError after notifying all", () => {
    const registry = new ContainerRegistry();
    const seen: string[] = [];
    registry.subscribe(() => {
      seen.push("first");
      throw new Error("listener boom");
    });
    registry.subscribe(() => {
      seen.push("second");
    });
    expect(() => registry.register("a", { useValue: 1 })).toThrow(
      AggregateError,
    );
    expect(seen).toEqual(["first", "second"]);
    // The mutation itself still happened.
    expect(registry.has("a")).toBe(true);
  });
});

describe("createToken()", () => {
  it("creates a token with a description", () => {
    const t = createToken<number>("counter");
    expect(t.description).toBe("counter");
  });
});
