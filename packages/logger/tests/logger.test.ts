import { describe, it, expect } from "vitest";
import {
  createLogger,
  LoggerLevel,
  createConsoleLoggerTransport,
  createJsonLoggerFormatter,
  createTextLoggerFormatter,
  createCompactLoggerFormatter,
  createLoggerFactory,
  createLoggerManager,
  loggerLevelToName,
  loggerLevelFromName,
  shouldLog,
  getLoggerLevels,
  getLoggerLevelNames,
  isLoggerLevel,
  isLoggerLevelName,
  createLoggerContext,
  isLoggerContext,
  createLoggerEntry,
  escapeLogText,
  hasLogControlCharacters,
  withLoggerContext,
} from "../src/index.js";

import type { LoggerEntry, LoggerTransport } from "../src/index.js";

describe("LoggerLevel utilities", () => {
  it("should convert level to name", () => {
    expect(loggerLevelToName(LoggerLevel.FATAL)).toBe("fatal");
    expect(loggerLevelToName(LoggerLevel.ERROR)).toBe("error");
    expect(loggerLevelToName(LoggerLevel.WARN)).toBe("warn");
    expect(loggerLevelToName(LoggerLevel.INFO)).toBe("info");
    expect(loggerLevelToName(LoggerLevel.DEBUG)).toBe("debug");
    expect(loggerLevelToName(LoggerLevel.TRACE)).toBe("trace");
  });

  it("should convert name to level", () => {
    expect(loggerLevelFromName("fatal")).toBe(LoggerLevel.FATAL);
    expect(loggerLevelFromName("error")).toBe(LoggerLevel.ERROR);
    expect(loggerLevelFromName("warn")).toBe(LoggerLevel.WARN);
    expect(loggerLevelFromName("info")).toBe(LoggerLevel.INFO);
    expect(loggerLevelFromName("debug")).toBe(LoggerLevel.DEBUG);
    expect(loggerLevelFromName("trace")).toBe(LoggerLevel.TRACE);
  });

  it("should handle alias 'warning' for warn", () => {
    expect(loggerLevelFromName("warning")).toBe(LoggerLevel.WARN);
  });

  it("should determine if level should be logged", () => {
    expect(shouldLog(LoggerLevel.INFO, LoggerLevel.ERROR)).toBe(true);
    expect(shouldLog(LoggerLevel.INFO, LoggerLevel.DEBUG)).toBe(false);
    expect(shouldLog(LoggerLevel.DEBUG, LoggerLevel.DEBUG)).toBe(true);
    expect(shouldLog(LoggerLevel.FATAL, LoggerLevel.FATAL)).toBe(true);
  });

  it("should return all levels", () => {
    const levels = getLoggerLevels();
    expect(levels).toHaveLength(6);
    expect(levels).toContain(LoggerLevel.FATAL);
  });

  it("should return all level names", () => {
    const names = getLoggerLevelNames();
    expect(names).toHaveLength(6);
    expect(names).toContain("fatal");
    expect(names).toContain("info");
  });

  it("should validate level values", () => {
    expect(isLoggerLevel(LoggerLevel.INFO)).toBe(true);
    expect(isLoggerLevel(999)).toBe(false);
  });

  it("should validate level names", () => {
    expect(isLoggerLevelName("info")).toBe(true);
    expect(isLoggerLevelName("invalid")).toBe(false);
  });
});

describe("createLogger", () => {
  it("should create a logger with defaults", () => {
    const logger = createLogger();
    expect(logger.name).toBe("zudojs");
    expect(logger.level).toBe(LoggerLevel.INFO);
    expect(logger.enabled).toBe(true);
  });

  it("should create a logger with custom options", () => {
    const logger = createLogger({
      name: "test",
      level: LoggerLevel.DEBUG,
    });
    expect(logger.name).toBe("test");
    expect(logger.level).toBe(LoggerLevel.DEBUG);
  });

  it("should log at different levels", () => {
    const logger = createLogger({ name: "test" });
    expect(() => logger.fatal("fatal")).not.toThrow();
    expect(() => logger.error("error")).not.toThrow();
    expect(() => logger.warn("warn")).not.toThrow();
    expect(() => logger.info("info")).not.toThrow();
    expect(() => logger.debug("debug")).not.toThrow();
    expect(() => logger.trace("trace")).not.toThrow();
  });

  it("should create child loggers", () => {
    const parent = createLogger({ name: "parent" });
    const child = parent.child({ name: "child" });
    expect(child.name).toBe("child");
  });

  it("should enable and disable", () => {
    const logger = createLogger({ name: "test" });
    logger.disable();
    expect(logger.enabled).toBe(false);
    logger.enable();
    expect(logger.enabled).toBe(true);
  });

  it("should change log level", () => {
    const logger = createLogger({ name: "test" });
    logger.setLevel(LoggerLevel.DEBUG);
    expect(logger.level).toBe(LoggerLevel.DEBUG);
  });

  it("should flush and close without error", async () => {
    const logger = createLogger({ name: "test" });
    await expect(logger.flush()).resolves.toBeUndefined();
    await expect(logger.close()).resolves.toBeUndefined();
  });
});

describe("Formatters", () => {
  it("should create text formatter", () => {
    const formatter = createTextLoggerFormatter();
    expect(formatter).toBeDefined();
  });

  it("should create JSON formatter", () => {
    const formatter = createJsonLoggerFormatter();
    expect(formatter).toBeDefined();
  });

  it("should create compact formatter", () => {
    const formatter = createCompactLoggerFormatter();
    expect(formatter).toBeDefined();
  });
});

describe("Transports", () => {
  it("should create console transport", () => {
    const transport = createConsoleLoggerTransport();
    expect(transport).toBeDefined();
    expect(transport.name).toBeDefined();
  });

  it("should create logger with custom transport", () => {
    const written: unknown[] = [];
    const transport = {
      name: "test",
      enabled: true,
      write: (entry: unknown) => {
        written.push(entry);
      },
    };

    const logger = createLogger({
      name: "test",
      transports: [transport],
    });

    logger.info("test message");
    expect(written.length).toBeGreaterThan(0);
  });
});

describe("LoggerFactory", () => {
  it("should create a factory", () => {
    const factory = createLoggerFactory();
    expect(factory).toBeDefined();
    expect(factory.size).toBe(0);
  });

  it("should create and retrieve loggers", () => {
    const factory = createLoggerFactory();
    const logger = factory.create("test");
    expect(factory.has("test")).toBe(true);
    expect(factory.get("test")).toBe(logger);
  });

  it("should create child loggers", () => {
    const factory = createLoggerFactory();
    const parent = factory.create("parent");
    const child = factory.child(parent, { name: "child" });
    expect(child.name).toBe("child");
  });

  it("should remove loggers", () => {
    const factory = createLoggerFactory();
    factory.create("test");
    expect(factory.remove("test")).toBe(true);
    expect(factory.has("test")).toBe(false);
  });

  it("should create transient loggers", () => {
    const factory = createLoggerFactory();
    const logger = factory.createTransient({ name: "transient" });
    expect(logger.name).toBe("transient");
  });
});

describe("LoggerManager", () => {
  it("should create a manager", () => {
    const manager = createLoggerManager();
    expect(manager).toBeDefined();
    expect(manager.isInitialized).toBe(false);
  });

  it("should initialize with a logger", () => {
    const manager = createLoggerManager();
    manager.initialize({ name: "app" });
    expect(manager.isInitialized).toBe(true);
    expect(manager.getLogger()).toBeDefined();
  });

  it("should create and retrieve named loggers", () => {
    const manager = createLoggerManager();
    manager.initialize({ name: "app" });
    const logger = manager.create("service");
    expect(manager.has("service")).toBe(true);
    expect(manager.get("service")).toBe(logger);
  });

  it("should flush and close", async () => {
    const manager = createLoggerManager();
    manager.initialize({ name: "app" });
    await manager.flush();
    await manager.close();
    expect(manager.isClosed).toBe(true);
  });
});

describe("LoggerContext", () => {
  it("should create a logger context", () => {
    const ctx = createLoggerContext({
      correlationId: "corr-123",
      metadata: { userId: "user-1" },
    });
    expect(ctx.identifiers.correlationId).toBe("corr-123");
    expect(ctx.metadata.userId).toBe("user-1");
  });

  it("should create a context with defaults", () => {
    const ctx = createLoggerContext();
    expect(ctx.identifiers).toEqual({});
    expect(ctx.metadata).toEqual({});
  });

  it("should merge contexts via parent", () => {
    const ctx1 = createLoggerContext({
      correlationId: "c1",
      metadata: { a: 1 },
    });
    const ctx2 = createLoggerContext({
      parent: ctx1,
      requestId: "r1",
      metadata: { b: 2 },
    });

    expect(ctx2.identifiers.correlationId).toBe("c1");
    expect(ctx2.identifiers.requestId).toBe("r1");
    expect(ctx2.metadata.a).toBe(1);
    expect(ctx2.metadata.b).toBe(2);
  });

  it("should validate context", () => {
    expect(isLoggerContext(createLoggerContext({}))).toBe(true);
    expect(isLoggerContext({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Round 8 audit
// ---------------------------------------------------------------------------

const ESC = "\u001b";

/** Collects entries written by a synchronous in-memory transport. */
function createCapturingTransport(): {
  readonly transport: LoggerTransport;
  readonly entries: LoggerEntry[];
} {
  const entries: LoggerEntry[] = [];

  return {
    entries,
    transport: {
      name: "capture",
      enabled: true,
      write(entry) {
        entries.push(entry);
      },
    },
  };
}

describe("LOGGER-01: log injection is escaped", () => {
  const hostile = "ok\n2020-01-01T00:00:00.000Z [FATAL] [auth] forged entry";

  it("escapes newlines in the message so no extra record can be forged", () => {
    const formatter = createTextLoggerFormatter();
    const output = formatter.format(
      createLoggerEntry({ level: LoggerLevel.INFO, message: hostile }),
    );

    expect(output).not.toContain("\n");
    expect(output).toContain("\\n");
    expect(output.split("\n")).toHaveLength(1);
  });

  it("escapes ANSI escape sequences and other control bytes", () => {
    const formatter = createTextLoggerFormatter();
    const output = formatter.format(
      createLoggerEntry({
        level: LoggerLevel.INFO,
        message: `${ESC}[2Jcleared\u0007`,
      }),
    );

    expect(output).not.toContain(ESC);
    expect(output).toContain("\\u001b");
    expect(output).toContain("\\x07");
  });

  it("escapes hostile metadata keys and values", () => {
    const formatter = createTextLoggerFormatter();
    const output = formatter.format(
      createLoggerEntry({
        level: LoggerLevel.INFO,
        message: "hi",
        metadata: { "bad\nkey": `bad${ESC}[31mvalue` },
      }),
    );

    expect(output).not.toContain("\n");
    expect(output).not.toContain(ESC);
  });

  it("escapes the compact formatter too", () => {
    const output = createCompactLoggerFormatter().format(
      createLoggerEntry({ level: LoggerLevel.INFO, message: hostile }),
    );

    expect(output.split("\n")).toHaveLength(1);
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeLogText("héllo wörld — ok")).toBe("héllo wörld — ok");
    expect(hasLogControlCharacters("plain")).toBe(false);
    expect(hasLogControlCharacters("two\nlines")).toBe(true);
  });
});

describe("LOGGER-02: secrets are redacted", () => {
  it("redacts secret-shaped metadata fields by default", () => {
    const capture = createCapturingTransport();
    const logger = createLogger({
      name: "svc",
      transports: [capture.transport],
    });

    logger.info("login", {
      username: "alice",
      password: "hunter2",
      apiKey: "sk-live-123",
      Authorization: "Bearer abc",
    });

    const metadata = capture.entries[0]?.metadata as Record<string, unknown>;

    expect(metadata["username"]).toBe("alice");
    expect(metadata["password"]).toBe("[REDACTED]");
    expect(metadata["apiKey"]).toBe("[REDACTED]");
    expect(metadata["Authorization"]).toBe("[REDACTED]");
  });

  it("cannot be bypassed by nesting, arrays or getters", () => {
    const capture = createCapturingTransport();
    const logger = createLogger({ transports: [capture.transport] });

    logger.info("nested", {
      outer: {
        credentials: [{ refresh_token: "leak-me" }],
        get dbPassword() {
          return "also-leak-me";
        },
      },
    });

    const serialized = JSON.stringify(capture.entries[0]?.metadata);

    expect(serialized).not.toContain("leak-me");
    expect(serialized).toContain("[REDACTED]");
  });

  it("honours a custom key list and can be disabled", () => {
    const capture = createCapturingTransport();
    const logger = createLogger({
      transports: [capture.transport],
      redact: { keys: ["ssn"], replacement: "***" },
    });

    logger.info("custom", { ssn: "123-45-6789", password: "p" });

    const metadata = capture.entries[0]?.metadata as Record<string, unknown>;
    expect(metadata["ssn"]).toBe("***");
    expect(metadata["password"]).toBe("***");

    const off = createCapturingTransport();
    const plain = createLogger({
      transports: [off.transport],
      redact: { enabled: false },
    });
    plain.info("off", { password: "visible" });

    expect(
      (off.entries[0]?.metadata as Record<string, unknown>)["password"],
    ).toBe("visible");
  });

  it("does not pollute prototypes through a __proto__ metadata key", () => {
    const capture = createCapturingTransport();
    const logger = createLogger({ transports: [capture.transport] });

    logger.info(
      "hostile",
      JSON.parse('{"__proto__":{"isAdmin":true},"safe":1}'),
    );

    const metadata = capture.entries[0]?.metadata as Record<string, unknown>;

    expect(({} as Record<string, unknown>)["isAdmin"]).toBeUndefined();
    expect(Object.getPrototypeOf(metadata)).toBe(Object.prototype);
    expect(metadata["safe"]).toBe(1);
  });
});

describe("LOGGER-03: the serializer survives hostile shapes", () => {
  it("serializes a circular metadata object instead of dropping the entry", () => {
    const circular: Record<string, unknown> = { name: "root" };
    circular["self"] = circular;

    const entry = createLoggerEntry({
      level: LoggerLevel.INFO,
      message: "cyclic",
      metadata: { circular },
    });

    const output = createJsonLoggerFormatter().format(entry);

    expect(output).toContain("[Circular]");
    expect(typeof JSON.parse(output)).toBe("object");
  });

  it("serializes BigInt metadata instead of throwing", () => {
    const entry = createLoggerEntry({
      level: LoggerLevel.INFO,
      message: "big",
      metadata: { size: 9007199254740993n },
    });

    const output = createJsonLoggerFormatter().format(entry);

    expect(output).toContain("9007199254740993");
  });

  it("still emits the entry through a JSON-formatted logger", () => {
    const written: string[] = [];
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

    const logger = createLogger({
      formatter: createJsonLoggerFormatter(),
      transports: [
        {
          name: "sink",
          enabled: true,
          write(entry) {
            written.push(entry.message);
          },
        },
      ],
    });

    logger.info("survives", { circular });

    expect(written).toHaveLength(1);
  });
});

describe("LOGGER-04: withContext actually propagates context", () => {
  it("attaches scoped context metadata to entries", () => {
    const capture = createCapturingTransport();
    const logger = createLogger({ transports: [capture.transport] });

    const scoped = logger.withContext(
      createLoggerContext({
        requestId: "req-1",
        metadata: { tenant: "acme" },
      }),
    );

    scoped.info("scoped");

    const metadata = capture.entries[0]?.metadata as Record<string, unknown>;

    expect(metadata["requestId"]).toBe("req-1");
    expect(metadata["tenant"]).toBe("acme");
  });

  it("does not leak context to the unscoped logger", () => {
    const capture = createCapturingTransport();
    const logger = createLogger({ transports: [capture.transport] });

    logger
      .withContext(createLoggerContext({ requestId: "req-2" }))
      .info("scoped");
    logger.info("unscoped");

    const scopedMetadata = capture.entries[0]?.metadata as Record<
      string,
      unknown
    >;
    const plainMetadata = capture.entries[1]?.metadata as Record<
      string,
      unknown
    >;

    expect(scopedMetadata["requestId"]).toBe("req-2");
    expect(plainMetadata["requestId"]).toBeUndefined();
  });

  it("withLoggerContext hands the scoped logger to the callback", () => {
    const capture = createCapturingTransport();
    const logger = createLogger({ transports: [capture.transport] });

    withLoggerContext(
      logger,
      createLoggerContext({ traceId: "t-9" }),
      (scoped) => {
        scoped.info("inside");
      },
    );

    expect(
      (capture.entries[0]?.metadata as Record<string, unknown>)["traceId"],
    ).toBe("t-9");
  });
});

describe("LOGGER-05: flush drains in-flight dispatches", () => {
  it("does not lose entries written to an async transport", async () => {
    const written: string[] = [];

    const logger = createLogger({
      transports: [
        {
          name: "async-sink",
          enabled: true,
          async write(entry) {
            await new Promise((resolve) => setTimeout(resolve, 5));
            written.push(entry.message);
          },
        },
      ],
    });

    logger.info("a");
    logger.info("b");

    expect(written).toHaveLength(0);

    await logger.flush();

    // The transport receives the FORMATTED entry, whose message is the
    // rendered line containing the original text.
    expect(written).toHaveLength(2);
    expect(written[0]).toContain("a");
    expect(written[1]).toContain("b");
  });

  it("drains on close as well", async () => {
    const written: string[] = [];

    const logger = createLogger({
      transports: [
        {
          name: "async-sink",
          enabled: true,
          async write(entry) {
            await new Promise((resolve) => setTimeout(resolve, 5));
            written.push(entry.message);
          },
        },
      ],
    });

    logger.info("only");
    await logger.close();

    expect(written).toHaveLength(1);
    expect(written[0]).toContain("only");
  });

  it("completes synchronously for a synchronous transport", () => {
    const capture = createCapturingTransport();
    const logger = createLogger({ transports: [capture.transport] });

    logger.info("immediate");

    expect(capture.entries).toHaveLength(1);
  });

  it("defers when asynchronous is enabled", async () => {
    const capture = createCapturingTransport();
    const logger = createLogger({
      transports: [capture.transport],
      asynchronous: true,
    });

    logger.info("deferred");

    expect(capture.entries).toHaveLength(0);

    await logger.flush();

    expect(capture.entries).toHaveLength(1);
  });
});

describe("LOGGER-06: transportTimeout bounds a hanging transport", () => {
  it("does not hang flush on a transport that never settles", async () => {
    const logger = createLogger({
      transportTimeout: 30,
      throwTransportErrors: false,
      transports: [
        {
          name: "hung",
          enabled: true,
          write: () => new Promise<void>(() => {}),
        },
      ],
    });

    logger.info("stuck");

    const started = Date.now();
    await logger.flush();

    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("LOGGER-07: the colors option is wired", () => {
  it("emits colour codes only on explicit opt-in", () => {
    const formatter = createTextLoggerFormatter();
    const entry = createLoggerEntry({
      level: LoggerLevel.ERROR,
      message: "boom",
    });

    expect(formatter.format(entry, {})).not.toContain(ESC);
    expect(formatter.format(entry, { colors: true })).toContain(`${ESC}[31m`);
  });
});
