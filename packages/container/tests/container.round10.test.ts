import { describe, it, expect } from "vitest";

import { ContainerScope, createContainer } from "../src/index.js";

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const SINGLETON = { scope: ContainerScope.SINGLETON };

describe("runtime/CONT-01", () => {
  it("replace() evicts and disposes singletons that captured the old instance", async () => {
    const c = createContainer();
    let next = 1;
    c.registerFactory("pool", () => ({ id: next++, disposed: false, dispose() { this.disposed = true; } }), [], SINGLETON);
    c.registerFactory("repo", (pool) => ({ pool }), ["pool"], SINGLETON);

    const before = c.resolve("repo") as { pool: { id: number; disposed: boolean } };
    c.replace("pool", { useFactory: () => ({ id: 100, dispose() {} }) }, SINGLETON);
    await tick();

    const after = c.resolve("repo") as { pool: { id: number } };
    expect(before.pool.disposed).toBe(true);
    expect(after).not.toBe(before);
    expect(after.pool.id).toBe(100);
  });

  it("cascades through a transient in between", () => {
    const c = createContainer();
    c.registerFactory("pool", () => ({ v: 1 }), [], SINGLETON);
    c.registerFactory("mid", (pool) => ({ pool }), ["pool"], { scope: ContainerScope.TRANSIENT });
    c.registerFactory("svc", (mid) => ({ mid }), ["mid"], SINGLETON);

    c.resolve("svc");
    c.replace("pool", { useFactory: () => ({ v: 2 }) }, SINGLETON);

    expect((c.resolve("svc") as { mid: { pool: { v: number } } }).mid.pool.v).toBe(2);
  });

  it("live scopes stop serving a replaced SCOPED instance", () => {
    const c = createContainer();
    c.registerFactory("req", () => "old", [], { scope: ContainerScope.SCOPED });
    const scope = c.createScope();
    expect(scope.resolve("req")).toBe("old");

    c.replace("req", { useFactory: () => "new" }, { scope: ContainerScope.SCOPED });

    expect(scope.resolve("req")).toBe("new");
  });
});

describe("runtime/CONT-02", () => {
  it("does not dispose a host-supplied value", async () => {
    const pool = { closed: false, dispose() { this.closed = true; } };
    const a = createContainer();
    const b = createContainer();
    a.registerValue("pool", pool);
    b.registerValue("pool", pool);
    a.resolve("pool");
    b.resolve("pool");

    await a.dispose();

    expect(pool.closed).toBe(false);
    expect(b.resolve("pool")).toBe(pool);
  });
});
