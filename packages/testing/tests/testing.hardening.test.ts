/**
 * @zudojs/testing — Hardening regression tests.
 *
 * This package's defects are the worst kind: assertions that pass when they
 * should fail, in the helpers other packages' suites rely on. Each test here
 * checks that a helper can now *fail* on the input it used to accept.
 */

import { describe, it, expect } from "vitest";
import {
  assertErrorMetadata,
  assertEventNotPublished,
  assertResponseBody,
  assertResponseBodyContains,
  assertSerializesCorrectly,
  assertDeserializesTo,
  createCleanupManager,
  createMockFn,
  createSpyFn,
  createSpyMethod,
  createSpyLogger,
  createStub,
  createStubClass,
  createTestClock,
  createTestApplication,
  deepEqual,
  findDifference,
  InMemoryTestStorage,
  jsonResponse,
} from "../src/index.js";

/* ─── TST-01: assertions must be able to fail ─────────────────────────────── */

describe("structural assertions", () => {
  const failsWith = (fn: () => void): string | null => {
    try {
      fn();
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  };

  it("fails when a Set differs in contents", () => {
    expect(
      failsWith(() =>
        assertResponseBody(jsonResponse(new Set([1, 2, 3])), new Set()),
      ),
    ).toMatch(/expected 0 items, received 3/);
  });

  it("fails when a Map differs from a plain object", () => {
    expect(
      failsWith(() =>
        assertResponseBody(jsonResponse(new Map([["a", 1]])), {}),
      ),
    ).toMatch(/expected object, received map/);
  });

  it("fails when the body carries an unexpected property", () => {
    expect(
      failsWith(() =>
        assertResponseBody(jsonResponse({ secret: undefined }), {}),
      ),
    ).toMatch(/unexpected in received value/);
  });

  it("passes regardless of key order", () => {
    expect(
      failsWith(() =>
        assertResponseBody(jsonResponse({ a: 1, b: 2 }), { b: 2, a: 1 }),
      ),
    ).toBeNull();
  });

  it("does not throw a TypeError on a circular body", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;

    const message = failsWith(() =>
      assertResponseBody(jsonResponse(circular), { a: 1 }),
    );
    expect(message).toMatch(/mismatch at/);
  });

  it("compares BigInt and Date by value", () => {
    expect(deepEqual({ n: 1n }, { n: 1n })).toBe(true);
    expect(deepEqual({ n: 1n }, { n: 2n })).toBe(false);
    expect(deepEqual(new Date("2026-01-01"), new Date("2026-01-01"))).toBe(
      true,
    );
    expect(deepEqual(new Date("2026-01-01"), new Date("2026-01-02"))).toBe(
      false,
    );
  });

  it("reports the path of the first difference", () => {
    const difference = findDifference(
      { user: { roles: ["admin", "editor"] } },
      { user: { roles: ["admin", "viewer"] } },
    );
    expect(difference?.path).toBe("value.user.roles[1]");
  });

  it("supports partial body matching", () => {
    expect(
      failsWith(() =>
        assertResponseBodyContains(jsonResponse({ id: "1", name: "a" }), {
          id: "1",
        }),
      ),
    ).toBeNull();
  });

  it("compares object metadata structurally", () => {
    const error = Object.assign(new Error("x"), {
      metadata: { ids: [1, 2] },
    });

    expect(
      failsWith(() => assertErrorMetadata(error, "ids", [1, 2])),
    ).toBeNull();
    expect(failsWith(() => assertErrorMetadata(error, "ids", [1, 3]))).toMatch(
      /Expected error metadata/,
    );
  });

  it("provides a negative event assertion", () => {
    expect(
      failsWith(() => assertEventNotPublished([], "refund.issued")),
    ).toBeNull();
  });
});

/* ─── TST-02 / TST-13 / TST-17: stubs ─────────────────────────────────────── */

describe("stubs", () => {
  it("can be awaited without hanging", async () => {
    const stub = createStub<{ find(): string }>();
    const settled = await Promise.race([
      Promise.resolve(stub).then(() => "resolved"),
      new Promise((resolve) => setTimeout(() => resolve("HUNG"), 200)),
    ]);

    expect(settled).toBe("resolved");
  });

  it("can be returned from an async factory", async () => {
    const make = async (): Promise<{ find(): string }> =>
      createStub<{ find(): string }>();
    await expect(make()).resolves.toBeDefined();
  });

  it("still stubs a method named like an Object.prototype member", () => {
    const stub = createStub<{ constructor(): string; valueOf(): string }>();
    expect(typeof stub.constructor).toBe("function");
    expect(typeof stub.valueOf).toBe("function");
  });

  it("honours overrides ahead of the default stub", () => {
    const stub = createStub<{ find(id: string): string }>({
      find: (id) => `user:${id}`,
    });
    expect(stub.find("7")).toBe("user:7");
  });

  it("keeps instanceof and non-overridden methods on a stubbed class", async () => {
    class RealDatabase {
      async connect(): Promise<void> {
        throw new Error("real connect must not run");
      }
      async query(): Promise<unknown[]> {
        throw new Error("real query must not run");
      }
    }

    const StubDatabase = createStubClass(RealDatabase, {
      query: async () => [{ id: 1 }],
    });
    const db = new StubDatabase();

    expect(db).toBeInstanceOf(RealDatabase);
    expect(await db.query()).toEqual([{ id: 1 }]);
    expect(db.connect()).toBeUndefined();
  });
});

/* ─── TST-03: cleanup failures must surface ───────────────────────────────── */

describe("cleanup manager", () => {
  it("reports every failed cleanup", async () => {
    const cleanup = createCleanupManager();
    cleanup.register(() => {
      throw new Error("close failed");
    }, "database");
    cleanup.register(() => {
      throw new Error("stop failed");
    }, "server");

    await expect(cleanup.dispose()).rejects.toThrow(
      /2 of 2 cleanup functions failed/,
    );
  });

  it("reports a single failure among successes", async () => {
    const ran: string[] = [];
    const cleanup = createCleanupManager();

    cleanup.register(() => {
      ran.push("first");
    }, "first");
    cleanup.register(() => {
      throw new Error("boom");
    }, "second");

    await expect(cleanup.dispose()).rejects.toThrow(/1 of 2/);
    expect(ran).toEqual(["first"]);
  });

  it("still resolves when everything succeeds", async () => {
    const cleanup = createCleanupManager();
    cleanup.register(() => undefined);
    await expect(cleanup.dispose()).resolves.toBeUndefined();
  });
});

/* ─── TST-04 / TST-05: mock functions ─────────────────────────────────────── */

describe("mock functions", () => {
  it("returns a real promise from mockResolvedValue", async () => {
    const mock = createMockFn<[], Promise<{ id: number }>>();
    mock.mockResolvedValue({ id: 1 });

    const result = mock();
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toEqual({ id: 1 });
  });

  it("rejects rather than throwing synchronously", async () => {
    const mock = createMockFn<[], Promise<never>>();
    mock.mockRejectedValue(new Error("boom"));

    const result = mock();
    expect(result).toBeInstanceOf(Promise);
    await expect(result).rejects.toThrow("boom");
  });

  it("honours an explicitly configured undefined", () => {
    const mock = createMockFn<[], number | undefined>(7);
    expect(mock()).toBe(7);

    mock.mockReturnValue(undefined);
    expect(mock()).toBeUndefined();
  });

  it("keeps results aligned with calls", () => {
    const mock = createMockFn<[], number | undefined>();
    mock.mockReturnValue(undefined);
    mock();
    mock.mockReturnValue(7);
    mock();

    expect(mock.callCount).toBe(2);
    expect(mock.results).toEqual([undefined, 7]);
  });

  it("restores the default return value on reset", () => {
    const mock = createMockFn<[], string>("default");
    mock.mockReturnValue("changed");
    mock.mockReset();
    expect(mock()).toBe("default");
  });
});

/* ─── TST-06 / TST-07: spies ──────────────────────────────────────────────── */

describe("spies", () => {
  it("preserves the receiver when spying on a method", () => {
    const service = {
      db: "real-db",
      save(value: string): string {
        return `${this.db}:${value}`;
      },
    };

    const spy = createSpyMethod(service, "save");
    expect(service.save("a")).toBe("real-db:a");
    expect(spy.callCount).toBe(1);
    spy.restore();
  });

  it("removes an inherited method rather than leaving an own property", () => {
    class Service {
      run(): string {
        return "ok";
      }
    }
    const instance = new Service();

    const spy = createSpyMethod(instance, "run");
    expect(Object.hasOwn(instance, "run")).toBe(true);

    spy.restore();
    expect(Object.hasOwn(instance, "run")).toBe(false);
    expect(instance.run()).toBe("ok");
  });

  it("reinstates an own method exactly as it was", () => {
    const original = (): string => "ok";
    const target = { run: original };

    const spy = createSpyMethod(target, "run");
    spy.restore();

    expect(target.run).toBe(original);
    expect(Object.hasOwn(target, "run")).toBe(true);
  });

  it("records errors thrown by the wrapped function", () => {
    const spy = createSpyFn(() => {
      throw new Error("inner");
    });

    expect(() => spy()).toThrow("inner");
    expect(spy.errors).toHaveLength(1);
    expect(spy.calls).toHaveLength(1);
  });
});

/* ─── TST-08: test clock ──────────────────────────────────────────────────── */

describe("test clock", () => {
  it("pins to the epoch when given zero", () => {
    expect(createTestClock(0).timestamp).toBe(0);
  });

  it("rejects an unparseable time instead of yielding NaN", () => {
    expect(() => createTestClock("nonsense")).toThrow(/not a valid date/);
    expect(() => createTestClock(0).set("also nonsense")).toThrow(
      /not a valid date/,
    );
  });

  it("still defaults to the real clock when nothing is supplied", () => {
    expect(createTestClock().timestamp).toBeGreaterThan(0);
  });

  it("advances deterministically", () => {
    const clock = createTestClock(0);
    clock.advance(60_000);
    expect(clock.now.toISOString()).toBe("1970-01-01T00:01:00.000Z");
  });
});

/* ─── TST-09 / TST-10: spy logger ─────────────────────────────────────────── */

describe("spy logger", () => {
  it("records logs written through a child logger", () => {
    const logger = createSpyLogger("app");
    logger.child({ name: "users" }).warn("careful");

    expect(logger.calls).toHaveLength(1);
    expect(logger.calls[0]?.message).toBe("careful");
  });

  it("records logs written through a context logger", () => {
    const logger = createSpyLogger("app");
    logger
      .withContext({ identifiers: { tenantId: "acme" }, metadata: {} })
      .info("scoped");

    expect(logger.calls).toHaveLength(1);
    expect(logger.calls[0]?.metadata).toMatchObject({ tenantId: "acme" });
  });

  it("honours the configured level", () => {
    const logger = createSpyLogger("app", 2 as never);
    logger.debug("noisy");
    logger.error("important");

    expect(logger.calls.map((call) => call.method)).toEqual(["error"]);
  });

  it("honours enable and disable", () => {
    const logger = createSpyLogger("app");
    logger.disable();
    logger.info("dropped");
    logger.enable();
    logger.info("kept");

    expect(logger.calls.map((call) => call.message)).toEqual(["kept"]);
  });

  it("matches object metadata structurally", () => {
    const logger = createSpyLogger("app");
    logger.info("x", { ids: [1, 2] } as never);
    expect(logger.findByMetadata("ids", [1, 2])).toHaveLength(1);
  });
});

/* ─── TST-11 / TST-14 / TST-15: application, storage, recorders ───────────── */

describe("test application and storage", () => {
  it("awaits container disposal and closes the logger last", async () => {
    const order: string[] = [];
    const app = createTestApplication({
      container: {
        dispose: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          order.push("container");
        },
      } as never,
      logger: {
        close: async () => {
          order.push("logger");
        },
      } as never,
    });

    await app.dispose();
    expect(order).toEqual(["container", "logger"]);
  });

  it("distinguishes a stored null from a miss", () => {
    const storage = new InMemoryTestStorage();
    storage.set("cached-miss", null);

    expect(storage.get("cached-miss")).toBeNull();
    expect(storage.has("cached-miss")).toBe(true);
    expect(storage.has("never-set")).toBe(false);
  });

  it("excludes expired entries from keys and size", async () => {
    const storage = new InMemoryTestStorage();
    storage.set("a", 1, 5);
    storage.set("b", 2);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(storage.keys()).toEqual(["b"]);
    expect(storage.size).toBe(1);
    expect(storage.has("a")).toBe(false);
  });
});

describe("serialization assertions compare structurally, not by JSON string", () => {
  it("fails when a Map is silently dropped by the round trip", () => {
    // Without preserveTypes a Map serialises to {}. Both sides then stringify
    // to "{}", so the old JSON.stringify comparison passed and the assertion
    // reported success on a round trip that had destroyed the value.
    const value = { entries: new Map([["a", 1]]) };
    expect(() => assertSerializesCorrectly(value)).toThrow(
      /Serialization round-trip failed/,
    );
  });

  it("fails when a Set is silently dropped by the round trip", () => {
    const value = { tags: new Set(["x"]) };
    expect(() => assertSerializesCorrectly(value)).toThrow(
      /Serialization round-trip failed/,
    );
  });

  it("still passes for a value that genuinely round-trips", () => {
    expect(() => assertSerializesCorrectly({ a: 1, b: ["x"] })).not.toThrow();
  });

  it("reports the path of the first difference", () => {
    expect(() =>
      assertDeserializesTo(JSON.stringify({ a: { b: 1 } }), { a: { b: 2 } }),
    ).toThrow(/Deserialized value mismatch at value\.a\.b/);
  });
});
