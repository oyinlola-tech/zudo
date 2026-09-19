import { describe, it, expect } from "vitest";

import {
  Container,
  DependencyResolutionError,
  Lifecycle,
  createContextKey,
  createContextStorage,
  createContextValues,
  createExecutionContext,
} from "../src/index.js";

describe("runtime/CORE-01", () => {
  it("rejects a singleton that captures a scoped dependency", () => {
    const container = new Container();
    container.register("RequestUser", { useFactory: () => ({ id: "u" }) }, "scoped");
    container.register("UserService", {
      useFactory: (c) => ({ user: c.resolve("RequestUser") }),
    });

    const scope = container.createScope();
    expect(() => scope.resolve("UserService")).toThrow(/Captive dependency/);
    expect(() => scope.resolve("UserService")).toThrow(DependencyResolutionError);
  });

  it("rejects a singleton that captures a scoped dependency through a transient", () => {
    const container = new Container();
    container.register("Req", { useFactory: () => ({}) }, "scoped");
    container.register("Mid", { useFactory: (c) => c.resolve("Req") }, "transient");
    container.register("Svc", { useFactory: (c) => c.resolve("Mid") });

    expect(() => container.createScope().resolve("Svc")).toThrow(
      /singleton "Svc" cannot depend on scoped "Req"/,
    );
  });

  it("rejects a scoped resolution with no active scope", () => {
    const container = new Container({ currentScope: () => undefined });
    container.register("Req", { useFactory: () => ({}) }, "scoped");

    expect(() => container.resolve("Req")).toThrow(/outside any scope/);
  });

  it("still lets scoped and transient consumers depend on scoped providers", () => {
    const container = new Container();
    container.register("Req", { useFactory: () => ({}) }, "scoped");
    container.register("Handler", { useFactory: (c) => c.resolve("Req") }, "scoped");

    const scope = container.createScope();
    expect(scope.resolve("Handler")).toBe(scope.resolve("Req"));
  });
});

describe("runtime/CORE-04", () => {
  it("a new execution does not inherit the enclosing execution's values", () => {
    const storage = createContextStorage();
    const TENANT = createContextKey<string>("tenant");
    const a = createExecutionContext({ principalId: "alice" });
    const b = createExecutionContext({ principalId: "bob" });

    storage.runWithValues(a, createContextValues().set(TENANT, "tenant-A"), () => {
      storage.run(b, () => {
        expect(storage.getValues()?.get(TENANT)).toBeUndefined();
        expect(storage.capture().values.get(TENANT)).toBeUndefined();
      });

      storage.runDerived({ operation: "child" }, () => {
        expect(storage.getValues()?.get(TENANT)).toBe("tenant-A");
      });
    });
  });
});

describe("runtime/CORE-05", () => {
  it("rolls back started participants when start fails", async () => {
    const log: string[] = [];
    const lc = new Lifecycle();
    lc.register({ name: "db", start: () => void log.push("db.start"), stop: () => void log.push("db.stop") });
    lc.register({
      name: "cache",
      start: () => {
        throw new Error("cache down");
      },
    });

    await expect(lc.start()).rejects.toThrow("cache down");
    expect(log).toEqual(["db.start", "db.stop"]);
  });

  it("does not dispose participants whose initialize never ran", async () => {
    const log: string[] = [];
    const lc = new Lifecycle();
    lc.register({
      name: "a",
      initialize: () => {
        throw new Error("a init fails");
      },
      dispose: () => void log.push("a.dispose"),
    });
    lc.register({ name: "b", dispose: () => void log.push("b.dispose") });

    await expect(lc.start()).rejects.toThrow("a init fails");
    await lc.shutdown();

    expect(log).toEqual(["a.dispose"]);
  });
});
