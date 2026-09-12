/**
 * Round-9 audit regression tests for @zudojs/container.
 *
 * One describe block per finding id.
 */

import { describe, it, expect } from "vitest";

import {
  createContainer,
  createToken,
  ContainerScope,
  ContainerLifecycle,
  ContainerLifecycleOwner,
  CircularDependencyError,
  DuplicateRegistrationError,
  RegistrationNotFoundError,
  ProviderResolutionError,
} from "../src/index.js";

class Resource {
  disposeCount = 0;
  dispose(): void {
    this.disposeCount += 1;
  }
}

class SlowResource {
  disposeCount = 0;
  release: (() => void) | undefined;
  dispose(): Promise<void> {
    this.disposeCount += 1;
    return new Promise<void>((resolve) => {
      this.release = resolve;
    });
  }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("CNT-R9-01: a useExisting alias of a cached target is not a second owner", () => {
  it("disposes a singleton aliased by a singleton alias exactly once", async () => {
    const c = createContainer();
    const TARGET = createToken<Resource>("target");
    const ALIAS = createToken<Resource>("alias");
    c.registerClass(TARGET, Resource, { scope: ContainerScope.SINGLETON });
    c.registerExisting(ALIAS, TARGET, { scope: ContainerScope.SINGLETON });

    const viaAlias = c.resolve(ALIAS);
    expect(viaAlias).toBe(c.resolve(TARGET));

    await c.dispose();
    expect(viaAlias.disposeCount).toBe(1);
  });

  it("still disposes a transient target captured by a singleton alias", async () => {
    const c = createContainer();
    const TARGET = createToken<Resource>("target");
    const ALIAS = createToken<Resource>("alias");
    c.registerClass(TARGET, Resource); // TRANSIENT: nobody else owns it
    c.registerExisting(ALIAS, TARGET, { scope: ContainerScope.SINGLETON });

    const captured = c.resolve(ALIAS);
    expect(c.resolve(ALIAS)).toBe(captured);

    await c.dispose();
    expect(captured.disposeCount).toBe(1);
  });

  it("does not double-dispose through a chain of aliases", async () => {
    const c = createContainer();
    const TARGET = createToken<Resource>("target");
    const A = createToken<Resource>("a");
    const B = createToken<Resource>("b");
    c.registerClass(TARGET, Resource, { scope: ContainerScope.SINGLETON });
    c.registerExisting(A, TARGET, { scope: ContainerScope.SINGLETON });
    c.registerExisting(B, A, { scope: ContainerScope.SINGLETON });

    const instance = c.resolve(B);
    await c.dispose();
    expect(instance.disposeCount).toBe(1);
  });
});

describe("CNT-R9-02: a SCOPED alias never lets a scope dispose a container singleton", () => {
  it("leaves the singleton alive when the scope is disposed", async () => {
    const c = createContainer();
    const TARGET = createToken<Resource>("target");
    const ALIAS = createToken<Resource>("alias");
    c.registerClass(TARGET, Resource, { scope: ContainerScope.SINGLETON });
    c.registerExisting(ALIAS, TARGET, { scope: ContainerScope.SCOPED });

    const scope = c.createScope();
    const singleton = scope.resolve(ALIAS);
    expect(singleton).toBe(c.resolve(TARGET));

    await scope.dispose();
    expect(singleton.disposeCount).toBe(0);

    await c.dispose();
    expect(singleton.disposeCount).toBe(1);
  });

  it("a SCOPED alias of a SCOPED target is disposed once with the scope", async () => {
    const c = createContainer();
    const TARGET = createToken<Resource>("target");
    const ALIAS = createToken<Resource>("alias");
    c.registerClass(TARGET, Resource, { scope: ContainerScope.SCOPED });
    c.registerExisting(ALIAS, TARGET, { scope: ContainerScope.SCOPED });

    const scope = c.createScope();
    const instance = scope.resolve(ALIAS);
    expect(instance).toBe(scope.resolve(TARGET));

    await scope.dispose();
    expect(instance.disposeCount).toBe(1);
  });
});

describe("CNT-R9-03: replacing or removing a target evicts cached aliases of it", () => {
  it("resolve(alias) returns the new instance after replace(target)", async () => {
    const c = createContainer();
    const TARGET = createToken<Resource>("target");
    const ALIAS = createToken<Resource>("alias");
    c.registerClass(TARGET, Resource, { scope: ContainerScope.SINGLETON });
    c.registerExisting(ALIAS, TARGET, { scope: ContainerScope.SINGLETON });

    const old = c.resolve(ALIAS);
    c.replace(TARGET, { useClass: Resource }, { scope: ContainerScope.SINGLETON });
    await tick(); // eviction disposal is asynchronous

    expect(old.disposeCount).toBe(1);
    const fresh = c.resolve(ALIAS);
    expect(fresh).not.toBe(old);
    expect(fresh).toBe(c.resolve(TARGET));
  });

  it("resolve(alias) fails after remove(target) instead of serving a disposed instance", async () => {
    const c = createContainer();
    const TARGET = createToken<Resource>("target");
    const ALIAS = createToken<Resource>("alias");
    c.registerClass(TARGET, Resource, { scope: ContainerScope.SINGLETON });
    c.registerExisting(ALIAS, TARGET, { scope: ContainerScope.SINGLETON });

    const old = c.resolve(ALIAS);
    c.remove(TARGET);
    await tick();

    expect(old.disposeCount).toBe(1);
    expect(() => c.resolve(ALIAS)).toThrow(ProviderResolutionError);
  });

  it("evicts through a chain of aliases", async () => {
    const c = createContainer();
    const TARGET = createToken<Resource>("target");
    const A = createToken<Resource>("a");
    const B = createToken<Resource>("b");
    c.registerClass(TARGET, Resource, { scope: ContainerScope.SINGLETON });
    c.registerExisting(A, TARGET, { scope: ContainerScope.SINGLETON });
    c.registerExisting(B, A, { scope: ContainerScope.SINGLETON });

    const old = c.resolve(B);
    c.replace(TARGET, { useClass: Resource }, { scope: ContainerScope.SINGLETON });
    await tick();

    expect(c.resolve(B)).not.toBe(old);
    expect(c.resolve(B)).toBe(c.resolve(TARGET));
  });
});

describe("CNT-R9-04: dispose() is marked before cleanup and shared by concurrent callers", () => {
  it("refuses resolve() while disposal is in flight", async () => {
    const c = createContainer();
    const SLOW = createToken<SlowResource>("slow");
    const OTHER = createToken<Resource>("other");
    c.registerClass(SLOW, SlowResource, { scope: ContainerScope.SINGLETON });
    c.registerClass(OTHER, Resource, { scope: ContainerScope.SINGLETON });
    const slow = c.resolve(SLOW);

    const disposal = c.dispose();
    expect(c.isDisposed()).toBe(true);
    expect(() => c.resolve(OTHER)).toThrow(/disposed/);

    slow.release?.();
    await disposal;
  });

  it("a second concurrent dispose() settles only once cleanup has finished", async () => {
    const c = createContainer();
    const SLOW = createToken<SlowResource>("slow");
    c.registerClass(SLOW, SlowResource, { scope: ContainerScope.SINGLETON });
    const slow = c.resolve(SLOW);

    const first = c.dispose();
    let secondSettled = false;
    const second = c.dispose().then(() => {
      secondSettled = true;
    });
    await tick();
    expect(secondSettled).toBe(false);

    slow.release?.();
    await Promise.all([first, second]);
    expect(secondSettled).toBe(true);
    expect(slow.disposeCount).toBe(1);

    await expect(c.dispose()).resolves.toBeUndefined();
  });

  it("scope.dispose() is likewise shared by concurrent callers", async () => {
    const c = createContainer();
    const SLOW = createToken<SlowResource>("slow");
    c.registerClass(SLOW, SlowResource, { scope: ContainerScope.SCOPED });
    const scope = c.createScope();
    const slow = scope.resolve(SLOW);

    const first = scope.dispose();
    let secondSettled = false;
    const second = scope.dispose().then(() => {
      secondSettled = true;
    });
    await tick();
    expect(secondSettled).toBe(false);

    slow.release?.();
    await Promise.all([first, second]);
    expect(secondSettled).toBe(true);
    expect(slow.disposeCount).toBe(1);
  });

  it("ContainerLifecycle refuses track() while a full disposal is in flight", async () => {
    const lifecycle = new ContainerLifecycle();
    const slow = new SlowResource();
    lifecycle.track("slow", slow, ContainerLifecycleOwner.CONTAINER);

    const disposal = lifecycle.dispose();
    expect(lifecycle.isDisposed()).toBe(true);
    expect(() => lifecycle.track("late", new Resource())).toThrow(
      /disposed/,
    );

    slow.release?.();
    await disposal;
  });
});

describe("CNT-R9-05: error classes the README names are importable from the package", () => {
  it("throws the re-exported DuplicateRegistrationError on duplicate registration", () => {
    const c = createContainer();
    c.registerValue("x", 1);
    expect(() => c.registerValue("x", 2)).toThrow(DuplicateRegistrationError);
  });

  it("throws the re-exported CircularDependencyError on a cycle", () => {
    const c = createContainer();
    c.registerFactory("a", () => 1, ["b"]);
    c.registerFactory("b", () => 2, ["a"]);
    expect(() => c.resolve("a")).toThrow(CircularDependencyError);
  });

  it("throws the re-exported RegistrationNotFoundError for unknown tokens", () => {
    const c = createContainer({ resolution: { autoRegisterClasses: false } });
    expect(() => c.resolve("missing")).toThrow(RegistrationNotFoundError);
  });
});
