/**
 * @zudojs/testing — Audit round 9 regression tests.
 *
 * One describe block per finding. Every test here failed against the
 * pre-fix source (see the finding ids in the round 9 report).
 */

import { describe, it, expect } from "vitest";
import { LoggerLevel, type LogMetadata } from "@zudojs/logger";

import {
  assertThrows,
  assertResponseBody,
  assertTypePreservesRoundTrip,
  createCleanupManager,
  createMockFn,
  createSpyLogger,
  createTestClock,
  deepEqual,
  findDifference,
  jsonResponse,
} from "../src/index.js";

function tick(ms = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ─── TST-R9-01 ───────────────────────────────────────────────────────────── */

describe("TST-R9-01: findByMetadata compares structurally, not by JSON.stringify", () => {
  it("no longer matches any Map against any other Map", () => {
    const logger = createSpyLogger();
    logger.info("x", { ctx: new Map([["a", 1]]) } as unknown as LogMetadata);

    expect(logger.findByMetadata("ctx", new Map())).toHaveLength(0);
    expect(logger.findByMetadata("ctx", new Map([["a", 1]]))).toHaveLength(1);
  });

  it("matches objects regardless of key order", () => {
    const logger = createSpyLogger();
    logger.info("x", { ctx: { a: 1, b: 2 } });

    expect(logger.findByMetadata("ctx", { b: 2, a: 1 })).toHaveLength(1);
  });

  it("does not treat an explicit undefined property as absent", () => {
    const logger = createSpyLogger();
    logger.info("x", { ctx: { a: 1, b: undefined } } as unknown as LogMetadata);

    expect(logger.findByMetadata("ctx", { a: 1 })).toHaveLength(0);
  });
});

/* ─── TST-R9-02 ───────────────────────────────────────────────────────────── */

describe("TST-R9-02: assertThrows explains an async function instead of 'did not throw'", () => {
  it("names assertRejects and swallows the rejection it cannot judge", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      expect(() =>
        assertThrows(async () => {
          throw new Error("boom");
        }),
      ).toThrow(/returned a promise; use assertRejects/);

      await tick();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("treats a resolved promise the same way", () => {
    expect(() => assertThrows(() => Promise.resolve(1))).toThrow(
      /use assertRejects/,
    );
  });

  it("still reports a plain non-throwing function as such", () => {
    expect(() => assertThrows(() => 42)).toThrow(
      "Expected function to throw, but it did not.",
    );
  });

  it("still returns the synchronous error", () => {
    const error = assertThrows(() => {
      throw new RangeError("out of range");
    }, "out of");

    expect(error).toBeInstanceOf(RangeError);
  });
});

/* ─── TST-R9-03 ───────────────────────────────────────────────────────────── */

describe("TST-R9-03: concurrent dispose() calls share the in-flight run", () => {
  it("does not resolve a second caller before the cleanups have run", async () => {
    const cleanup = createCleanupManager();
    let released = false;
    cleanup.register(async () => {
      await tick(20);
      released = true;
    });

    const first = cleanup.dispose();
    await cleanup.dispose();

    expect(released).toBe(true);
    await first;
  });

  it("hands the same AggregateError to every concurrent caller", async () => {
    const cleanup = createCleanupManager();
    cleanup.register(async () => {
      await tick(5);
      throw new Error("leak");
    }, "socket");

    const first = cleanup.dispose();
    const second = cleanup.dispose();

    await expect(first).rejects.toBeInstanceOf(AggregateError);
    await expect(second).rejects.toThrow(/socket/);
  });

  it("resolves immediately once disposal has completed", async () => {
    const cleanup = createCleanupManager();
    let runs = 0;
    cleanup.register(() => {
      runs += 1;
    });

    await cleanup.dispose();
    await cleanup.dispose();

    expect(runs).toBe(1);
    expect(cleanup.disposed).toBe(true);
    expect(() => cleanup.register(() => undefined)).toThrow(/disposed/);
  });
});

/* ─── TST-R9-04 ───────────────────────────────────────────────────────────── */

describe("TST-R9-04: child() honours metadata and level like a real child logger", () => {
  it("records child metadata on every call the child writes", () => {
    const logger = createSpyLogger();
    const child = logger.child({ name: "users", metadata: { module: "users" } });

    child.info("created", { userId: "u_1" });

    expect(logger.findByMetadata("module", "users")).toHaveLength(1);
    expect(logger.calls[0]?.metadata).toEqual({ module: "users", userId: "u_1" });
    expect(child.name).toBe("test.users");
  });

  it("lets call metadata override child metadata", () => {
    const logger = createSpyLogger();
    logger.child({ metadata: { module: "a" } }).info("x", { module: "b" });

    expect(logger.calls[0]?.metadata).toEqual({ module: "b" });
  });

  it("merges grandchild metadata over the child's", () => {
    const logger = createSpyLogger();
    logger
      .child({ metadata: { module: "users", stage: "one" } })
      .child({ metadata: { stage: "two" } })
      .warn("x");

    expect(logger.calls[0]?.metadata).toEqual({ module: "users", stage: "two" });
  });

  it("applies a child level override", () => {
    const logger = createSpyLogger();
    const quiet = logger.child({ level: LoggerLevel.ERROR });

    quiet.info("dropped");
    quiet.error("kept");

    expect(logger.calls.map((call) => call.message)).toEqual(["kept"]);
    expect(quiet.level).toBe(LoggerLevel.ERROR);
    expect(logger.level).toBe(LoggerLevel.TRACE);
  });

  it("inherits the parent level when the child sets none", () => {
    const logger = createSpyLogger("test", LoggerLevel.WARN);
    logger.child({ name: "x" }).info("dropped");

    expect(logger.calls).toHaveLength(0);
  });
});

/* ─── TST-R9-05 ───────────────────────────────────────────────────────────── */

describe("TST-R9-05: Sets and Maps of objects compare by value", () => {
  it("treats Sets of equal objects as equal", () => {
    expect(deepEqual(new Set([{ a: 1 }, { b: 2 }]), new Set([{ b: 2 }, { a: 1 }]))).toBe(
      true,
    );
    expect(deepEqual(new Set([{ a: 1 }]), new Set([{ a: 2 }]))).toBe(false);
  });

  it("does not let one actual entry satisfy two expected entries", () => {
    expect(deepEqual(new Set([{ a: 1 }, { a: 1 }]), new Set([{ a: 1 }, { a: 2 }]))).toBe(
      false,
    );
  });

  it("matches Map keys structurally", () => {
    const actual = new Map([[{ id: 1 }, "one"]]);
    const expected = new Map([[{ id: 1 }, "one"]]);

    expect(deepEqual(actual, expected)).toBe(true);
    expect(findDifference(actual, new Map([[{ id: 1 }, "two"]]))).toMatchObject({
      reason: 'expected "two", received "one"',
    });
  });

  it("makes the README Set example usable with object members", () => {
    const response = jsonResponse({ roles: new Set([{ name: "admin" }]) });

    expect(() =>
      assertResponseBody(response, { roles: new Set([{ name: "admin" }]) }),
    ).not.toThrow();
    expect(() =>
      assertResponseBody(response, { roles: new Set([{ name: "user" }]) }),
    ).toThrow(/missing item/);
  });

  it("still handles cycles inside Set members", () => {
    const left: Record<string, unknown> = { name: "a" };
    left["self"] = left;
    const right: Record<string, unknown> = { name: "a" };
    right["self"] = right;

    expect(deepEqual(new Set([left]), new Set([right]))).toBe(true);
  });
});

/* ─── TST-R9-06 ───────────────────────────────────────────────────────────── */

describe("TST-R9-06: clock.add() rejects non-finite durations", () => {
  it("throws instead of turning the clock into Invalid Date", () => {
    const clock = createTestClock(0);

    expect(() => clock.add({ minutes: Number.NaN })).toThrow(TypeError);
    expect(() => clock.add({ days: Number.POSITIVE_INFINITY })).toThrow(
      /not finite/,
    );
    expect(clock.timestamp).toBe(0);
    expect(Number.isNaN(clock.now.getTime())).toBe(false);
  });

  it("still adds finite durations", () => {
    const clock = createTestClock(0);
    clock.add({ hours: 1, minutes: 30 });

    expect(clock.timestamp).toBe(5_400_000);
  });
});

/* ─── TST-R9-07 ───────────────────────────────────────────────────────────── */

describe("TST-R9-07: mock results stay aligned with calls when the implementation throws", () => {
  it("keeps one result slot per call and records the error", () => {
    const mock = createMockFn<[number], number>();
    mock.mockImplementation((n) => {
      if (n === 1) throw new Error("bad");
      return n * 2;
    });

    expect(() => mock(1)).toThrow("bad");
    expect(mock(2)).toBe(4);

    expect(mock.calls).toEqual([[1], [2]]);
    expect(mock.results).toEqual([undefined, 4]);
    expect(mock.errors).toHaveLength(1);
    expect((mock.errors[0] as Error).message).toBe("bad");
  });

  it("clears errors on mockClear and mockReset", () => {
    const mock = createMockFn<[], void>();
    mock.mockImplementation(() => {
      throw new Error("x");
    });
    expect(() => mock()).toThrow();

    mock.mockClear();
    expect(mock.errors).toHaveLength(0);

    expect(() => mock()).toThrow();
    mock.mockReset();
    expect(mock.errors).toHaveLength(0);
    expect(mock()).toBeUndefined();
  });
});

/* ─── TST-R9-08 ───────────────────────────────────────────────────────────── */

describe("TST-R9-08: assertTypePreservesRoundTrip fails as an assertion for BigInt values", () => {
  it("throws the assertion error rather than a TypeError from JSON.stringify", () => {
    let caught: unknown;

    try {
      assertTypePreservesRoundTrip({ n: 10n }, () => false, "bigint");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(TypeError);
    expect((caught as Error).message).toMatch(/Type preservation failed for bigint: \{ n: 10n \}/);
  });

  it("still passes when the checker accepts the restored value", () => {
    expect(() =>
      assertTypePreservesRoundTrip(
        new Map([["a", 1]]),
        (restored) => restored instanceof Map && restored.get("a") === 1,
        "map",
      ),
    ).not.toThrow();
  });
});
