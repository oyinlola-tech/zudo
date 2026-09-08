import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ConsoleLogger,
  LoggerFactory,
  serializeLogError,
  sanitizeLogValue,
  safeLogStringify,
  shouldLog,
  resolveLogLevel,
  isLogLevel,
  createLogRedactor,
  InvalidArgumentError,
} from "../src/index.js";
import type { LogLevelType } from "../src/index.js";

type Captured = { method: string; message: string };

function captureConsole(): {
  captured: Captured[];
  restore: () => void;
} {
  const captured: Captured[] = [];
  const spies = (["debug", "info", "warn", "error", "log"] as const).map(
    (method) =>
      vi.spyOn(console, method).mockImplementation((message: unknown) => {
        captured.push({ method, message: String(message) });
      }),
  );
  return {
    captured,
    restore: () => {
      for (const spy of spies) spy.mockRestore();
    },
  };
}

function parseLast(captured: Captured[]): Record<string, unknown> {
  const last = captured[captured.length - 1];
  expect(last).toBeDefined();
  return JSON.parse(last!.message) as Record<string, unknown>;
}

describe("log levels", () => {
  it("filters messages below the minimum level", () => {
    expect(shouldLog("debug", "info")).toBe(false);
    expect(shouldLog("warn", "info")).toBe(true);
    expect(shouldLog("info", "info")).toBe(true);
  });

  it("treats unknown minimum levels as info", () => {
    expect(shouldLog("warn", "banana" as LogLevelType)).toBe(true);
    expect(shouldLog("debug", "banana" as LogLevelType)).toBe(false);
  });

  it("resolves unknown levels to info", () => {
    expect(resolveLogLevel("verbose")).toBe("info");
    expect(resolveLogLevel("fatal")).toBe("fatal");
    expect(isLogLevel("warn")).toBe(true);
    expect(isLogLevel("loud")).toBe(false);
  });
});

describe("ConsoleLogger", () => {
  let capture: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    capture = captureConsole();
  });

  afterEach(() => {
    capture.restore();
  });

  it("throws InvalidArgumentError at construction for an invalid level", () => {
    expect(
      () => new ConsoleLogger({ level: "extreme" as never, structured: true }),
    ).toThrow(InvalidArgumentError);
    /* Levels are case-sensitive: "INFO" is not a level. */
    expect(() => new ConsoleLogger({ level: "INFO" as never })).toThrow(
      /Unknown log level "INFO"/,
    );
    expect(() =>
      new LoggerFactory().create({ level: "verbose" as never }),
    ).toThrow(InvalidArgumentError);

    /* Valid levels still filter normally. */
    const logger = new ConsoleLogger({ level: "info", structured: true });
    logger.debug("hidden");
    logger.info("visible");
    expect(capture.captured).toHaveLength(1);
    expect(capture.captured[0]!.method).toBe("info");
  });

  it("applies the redaction hook to context and error details", () => {
    const logger = new ConsoleLogger({
      structured: true,
      timestamps: false,
      redact: createLogRedactor({ patterns: ["ssn"] }),
      context: { apiToken: "abc123", service: "auth" },
    });

    logger.info("login", { user: { password: "hunter2", name: "bob" } });
    const context = parseLast(capture.captured).context as Record<
      string,
      unknown
    >;
    expect(context.apiToken).toBe("[REDACTED]");
    expect(context.service).toBe("auth");
    expect((context.user as Record<string, unknown>).password).toBe(
      "[REDACTED]",
    );
    expect((context.user as Record<string, unknown>).name).toBe("bob");

    class DetailedError extends Error {
      public details = { ssn: "123-45-6789", attempt: 2 };
      public override cause = Object.assign(new Error("inner"), {
        details: { dbPassword: "pw" },
      });
    }
    logger.error("failed", new DetailedError("outer"));
    const error = parseLast(capture.captured).error as Record<string, unknown>;
    expect((error.details as Record<string, unknown>).ssn).toBe("[REDACTED]");
    expect((error.details as Record<string, unknown>).attempt).toBe(2);
    const cause = error.cause as Record<string, unknown>;
    expect((cause.details as Record<string, unknown>).dbPassword).toBe(
      "[REDACTED]",
    );
  });

  it("emits persistent constructor context on every entry", () => {
    const logger = new ConsoleLogger({
      structured: true,
      timestamps: false,
      context: { app: "zudo" },
    });

    logger.info("hello");
    const output = parseLast(capture.captured);
    expect((output.context as Record<string, unknown>).app).toBe("zudo");
  });

  it("includes child({moduleId}) context in output", () => {
    const logger = new ConsoleLogger({ structured: true, timestamps: false });
    const child = logger.child({ moduleId: "auth" });

    child.info("child message");
    const output = parseLast(capture.captured);
    expect((output.context as Record<string, unknown>).moduleId).toBe("auth");
  });

  it("builds grandchildren from the merged context", () => {
    const logger = new ConsoleLogger({
      structured: true,
      timestamps: false,
      context: { root: true },
    });
    const grandchild = logger.child({ moduleId: "a" }).child({ op: "b" });

    grandchild.info("deep");
    const context = parseLast(capture.captured).context as Record<
      string,
      unknown
    >;
    expect(context.root).toBe(true);
    expect(context.moduleId).toBe("a");
    expect(context.op).toBe("b");
  });

  it("lets per-call context override persistent context", () => {
    const logger = new ConsoleLogger({
      structured: true,
      timestamps: false,
      context: { region: "persistent", keep: 1 },
    });

    logger.info("msg", { region: "per-call" });
    const context = parseLast(capture.captured).context as Record<
      string,
      unknown
    >;
    expect(context.region).toBe("per-call");
    expect(context.keep).toBe(1);
  });

  it("emits service, version, and environment as top-level fields", () => {
    const logger = new ConsoleLogger({
      structured: true,
      timestamps: false,
      service: "svc",
      version: "1.2.3",
      environment: "test",
    });

    logger.info("with identity");
    const output = parseLast(capture.captured);
    expect(output.service).toBe("svc");
    expect(output.version).toBe("1.2.3");
    expect(output.environment).toBe("test");
  });

  it("survives circular structures, BigInt, and throwing toJSON", () => {
    const logger = new ConsoleLogger({ structured: true, timestamps: false });

    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;

    logger.info("hard values", {
      circular,
      big: 10n,
      exploding: {
        toJSON() {
          throw new Error("no json for you");
        },
      },
    });

    const context = parseLast(capture.captured).context as Record<
      string,
      unknown
    >;
    expect((context.circular as Record<string, unknown>).self).toBe(
      "[Circular]",
    );
    expect(context.big).toBe("10");
    expect(context.exploding).toBe("[Unserializable]");
  });

  it("routes trace output through console.debug", () => {
    const logger = new ConsoleLogger({
      level: "trace",
      structured: true,
      timestamps: false,
    });

    logger.trace("tracing");
    const entry = capture.captured[capture.captured.length - 1];
    expect(entry!.method).toBe("debug");
  });

  it("writes human-readable output when structured is disabled", () => {
    const logger = new ConsoleLogger({
      structured: false,
      timestamps: false,
      context: { module: "auth" },
    });

    logger.warn("plain message", { code: 7 });
    const entry = capture.captured[capture.captured.length - 1];
    expect(entry!.message).toContain("WARN: plain message");
    expect(entry!.message).toContain("module=auth");
    expect(entry!.message).toContain("code=7");
  });
});

describe("serializeLogError", () => {
  it("serializes nested causes recursively with a depth bound", () => {
    let error: Error = new Error("level-0");
    for (let index = 1; index <= 8; index++) {
      const next = new Error(`level-${index}`);
      next.cause = error;
      error = next;
    }

    const serialized = serializeLogError(error);
    let cursor: unknown = serialized;
    let depth = 0;
    while (
      cursor !== undefined &&
      typeof cursor === "object" &&
      cursor !== null &&
      "cause" in (cursor as Record<string, unknown>)
    ) {
      cursor = (cursor as Record<string, unknown>).cause;
      depth += 1;
      if (typeof cursor === "string") break;
    }

    expect(depth).toBeLessThanOrEqual(6);
    expect(cursor).toBe("[MaxDepth]");
  });

  it("passes details through the sanitizer", () => {
    const detailed = new Error("with details") as Error & { details: unknown };
    const circular: Record<string, unknown> = {};
    circular.me = circular;
    detailed.details = { big: 5n, circular };

    const serialized = serializeLogError(detailed);
    const details = serialized.details as Record<string, unknown>;
    expect(details.big).toBe("5");
    expect((details.circular as Record<string, unknown>).me).toBe("[Circular]");
  });

  it("handles non-error values", () => {
    expect(serializeLogError("plain").message).toBe("plain");
    expect(serializeLogError(42).message).toBe("42");
    expect(serializeLogError({ a: 1 }).details).toEqual({ a: 1 });
  });
});

describe("safe stringification helpers", () => {
  it("safeLogStringify never throws", () => {
    const circular: Record<string, unknown> = {};
    circular.loop = circular;
    expect(() => safeLogStringify(circular)).not.toThrow();
    expect(safeLogStringify(1n)).toBe('"1"');
  });

  it("sanitizes maps, sets, dates, and functions", () => {
    const sanitized = sanitizeLogValue({
      map: new Map([["k", 1n]]),
      set: new Set([1, 2]),
      when: new Date("2026-01-01T00:00:00.000Z"),
      fn: function namedFn() {},
    }) as Record<string, unknown>;

    expect(sanitized.map).toEqual({ k: "1" });
    expect(sanitized.set).toEqual([1, 2]);
    expect(sanitized.when).toBe("2026-01-01T00:00:00.000Z");
    expect(sanitized.fn).toBe("[Function namedFn]");
  });
});

describe("LoggerFactory", () => {
  it("creates console loggers and rejects unknown implementations", () => {
    const factory = new LoggerFactory();
    expect(factory.create({ implementation: "console" })).toBeInstanceOf(
      ConsoleLogger,
    );
    expect(() => factory.create({ implementation: "syslog" })).toThrow(
      /Unsupported logger implementation/,
    );
  });
});
