/**
 * Regression tests for the round-11 audit findings (MSG-L-*).
 */

import { describe, it, expect } from "vitest";

import {
  createBufferedLoggerTransport,
  createJsonLoggerFormatter,
  createLogger,
  createLoggerEntry,
  createLoggerManagerFromLogger,
  createStructuredLoggerFormatter,
  formatLoggerEntry,
  InvalidLoggerEntryError,
  InvalidLoggerLevelError,
  isLoggerError,
  LoggerDisposedError,
  LoggerFormatterNotFoundError,
  LoggerLevel,
  LoggerTimeoutError,
  LoggerTransportClosedError,
  loggerLevelFromName,
  loggerLevelToName,
} from "../src/index.js";

import type { LoggerEntry } from "../src/index.js";

/** Collects whatever the transport is actually handed. */
function recorder(): {
  readonly records: Record<string, unknown>[];
  readonly transport: (entry: LoggerEntry) => void;
} {
  const records: Record<string, unknown>[] = [];
  return {
    records,
    transport: (entry: LoggerEntry) => {
      records.push(entry as unknown as Record<string, unknown>);
    },
  };
}

describe("MSG-L-01", () => {
  it("hands a formatter's object output to the transport", () => {
    const sink = recorder();

    const logger = createLogger({
      name: "app",
      formatter: createStructuredLoggerFormatter(),
      transports: [sink.transport],
    });

    logger.info("hello", { k: 1 });

    expect(sink.records).toHaveLength(1);
    const record = sink.records[0]!;

    // The structured formatter serializes the timestamp; the raw entry
    // carries a Date. Seeing a string proves the formatted output was
    // used rather than discarded.
    expect(typeof record["timestamp"]).toBe("string");
    expect(record["message"]).toBe("hello");
    expect(record["metadata"]).toEqual({ k: 1 });
  });

  it("still passes a string formatter's output as entry.message", () => {
    const sink = recorder();

    const logger = createLogger({
      formatter: createJsonLoggerFormatter(),
      transports: [sink.transport],
    });

    logger.info("hello");

    expect(typeof sink.records[0]!["message"]).toBe("string");
    expect(String(sink.records[0]!["message"])).toContain('"hello"');
  });
});

describe("MSG-L-02", () => {
  const withThrowingGetter = (): Record<string, unknown> => ({
    id: 7,
    get relation(): unknown {
      throw new Error("lazy relation not loaded");
    },
  });

  it("does not let a throwing metadata getter escape logger.info()", () => {
    const sink = recorder();

    const logger = createLogger({ transports: [sink.transport] });

    expect(() => {
      logger.info("boom", { user: withThrowingGetter() });
    }).not.toThrow();

    const metadata = sink.records[0]!["metadata"] as {
      user: Record<string, unknown>;
    };

    expect(metadata.user["id"]).toBe(7);
    expect(metadata.user["relation"]).toBe("[Unreadable]");
  });

  it("is a silent no-op when the level filters the call out", () => {
    const sink = recorder();

    const logger = createLogger({
      level: LoggerLevel.ERROR,
      transports: [sink.transport],
    });

    expect(() => {
      logger.info("boom", { user: withThrowingGetter() });
    }).not.toThrow();

    expect(sink.records).toHaveLength(0);
  });

  it("routes the read failure through handleInfrastructureError", () => {
    const sink = recorder();

    const logger = createLogger({
      transports: [sink.transport],
      throwTransportErrors: true,
    });

    let thrown: unknown;
    try {
      logger.info("boom", { user: withThrowingGetter() });
    } catch (error) {
      thrown = error;
    }

    expect(isLoggerError(thrown)).toBe(true);
    // The line is still emitted before the failure is reported.
    expect(sink.records).toHaveLength(1);
  });
});

describe("MSG-L-03", () => {
  it("logs a repeated (non-circular) reference instead of [Circular]", () => {
    const sink = recorder();

    const logger = createLogger({ transports: [sink.transport] });

    const user = { id: 7, name: "ada" };
    logger.info("dup", { actor: user, target: user });

    const metadata = sink.records[0]!["metadata"] as Record<string, unknown>;

    expect(metadata["actor"]).toEqual({ id: 7, name: "ada" });
    expect(metadata["target"]).toEqual({ id: 7, name: "ada" });
  });

  it("still replaces a genuine back-edge with [Circular]", () => {
    const sink = recorder();

    const logger = createLogger({ transports: [sink.transport] });

    const node: Record<string, unknown> = { id: 1 };
    node["self"] = node;

    logger.info("cycle", { node });

    const metadata = sink.records[0]!["metadata"] as {
      node: Record<string, unknown>;
    };

    expect(metadata.node["id"]).toBe(1);
    expect(metadata.node["self"]).toBe("[Circular]");
  });

  it("survives the second (serialization) walk over the same payload", () => {
    const entry = createLoggerEntry({
      level: LoggerLevel.INFO,
      message: "dup",
      metadata: (() => {
        const shared = { id: 7 };
        return { actor: shared, target: shared };
      })() as never,
    });

    const json = JSON.parse(createJsonLoggerFormatter().format(entry)) as {
      metadata: Record<string, unknown>;
    };

    expect(json.metadata["actor"]).toEqual({ id: 7 });
    expect(json.metadata["target"]).toEqual({ id: 7 });
  });

  it("logs a repeated array reference", () => {
    const sink = recorder();

    const logger = createLogger({ transports: [sink.transport] });

    const tags = ["a", "b"];
    logger.info("dup", { first: tags, second: tags });

    const metadata = sink.records[0]!["metadata"] as Record<string, unknown>;

    expect(metadata["first"]).toEqual(["a", "b"]);
    expect(metadata["second"]).toEqual(["a", "b"]);
  });
});

describe("MSG-L-04", () => {
  it("flushes and closes a logger adopted through createLoggerManagerFromLogger", async () => {
    const delivered: LoggerEntry[] = [];
    let closed = false;

    const buffered = createBufferedLoggerTransport(
      {
        name: "sink",
        enabled: true,
        write(entry) {
          delivered.push(entry);
        },
        close() {
          closed = true;
        },
      },
      { name: "buffered", maxSize: 1000 },
    );

    const logger = createLogger({ name: "adopted", transports: [buffered] });
    const manager = createLoggerManagerFromLogger(logger);

    logger.info("buffered entry");

    expect(manager.size).toBe(1);
    expect(manager.getAll()).toContain(logger);

    await manager.flush();
    expect(delivered).toHaveLength(1);

    await manager.close();
    expect(closed).toBe(true);
  });
});

describe("MSG-L-05", () => {
  it("raises LoggerTimeoutError when a transport exceeds transportTimeout", async () => {
    const logger = createLogger({
      transports: [
        {
          name: "hang",
          enabled: true,
          write: () => new Promise<void>(() => {}),
        },
      ],
      transportTimeout: 5,
      throwTransportErrors: true,
    });

    logger.info("x");

    let thrown: unknown;
    try {
      await logger.flush();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(LoggerTimeoutError);
    expect((thrown as LoggerTimeoutError).transportName).toBe("hang");
    expect((thrown as LoggerTimeoutError).timeout).toBe(5);
  });

  it("names the transport on an ordinary write failure", async () => {
    const logger = createLogger({
      transports: [
        {
          name: "broken",
          enabled: true,
          write() {
            throw new Error("disk full");
          },
        },
      ],
      throwTransportErrors: true,
    });

    let thrown: unknown;
    try {
      logger.info("x");
    } catch (error) {
      thrown = error;
    }

    expect(isLoggerError(thrown)).toBe(true);
    expect((thrown as { transportName?: string }).transportName).toBe("broken");
  });

  it("names the formatter on a formatter failure", () => {
    const logger = createLogger({
      formatter: {
        name: "exploding",
        format() {
          throw new Error("nope");
        },
      },
      transports: [recorder().transport],
      throwTransportErrors: true,
    });

    let thrown: unknown;
    try {
      logger.info("x");
    } catch (error) {
      thrown = error;
    }

    expect((thrown as { formatterName?: string }).formatterName).toBe(
      "exploding",
    );
  });

  it("raises LoggerDisposedError from a closed LoggerManager", async () => {
    const manager = createLoggerManagerFromLogger(
      createLogger({ name: "m", transports: [recorder().transport] }),
    );

    await manager.close();

    let thrown: unknown;
    try {
      manager.getLogger();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(LoggerDisposedError);
    expect(isLoggerError(thrown)).toBe(true);
  });

  it("raises LoggerFormatterNotFoundError for an unresolved formatter id", () => {
    const entry = createLoggerEntry({
      level: LoggerLevel.INFO,
      message: "x",
    });

    expect(() => formatLoggerEntry("json", entry)).toThrow(
      LoggerFormatterNotFoundError,
    );
  });

  it("raises InvalidLoggerLevelError for an unknown level", () => {
    expect(() => loggerLevelFromName("nope")).toThrow(InvalidLoggerLevelError);
    expect(() => loggerLevelToName(42 as LoggerLevel)).toThrow(
      InvalidLoggerLevelError,
    );
  });

  it("raises InvalidLoggerEntryError for an invalid timestamp", () => {
    expect(() =>
      createLoggerEntry({
        level: LoggerLevel.INFO,
        message: "x",
        timestamp: new Date(Number.NaN),
      }),
    ).toThrow(InvalidLoggerEntryError);
  });

  it("raises LoggerTransportClosedError when writing to a closed buffered transport", async () => {
    const buffered = createBufferedLoggerTransport(
      {
        name: "sink",
        enabled: true,
        write() {},
      },
      { name: "buffered" },
    );

    await buffered.close();

    await expect(
      Promise.resolve(
        buffered.write(
          createLoggerEntry({ level: LoggerLevel.INFO, message: "x" }),
        ),
      ),
    ).rejects.toBeInstanceOf(LoggerTransportClosedError);
  });
});

describe("MSG-L-06", () => {
  it("keeps Map and Set metadata contents", () => {
    const sink = recorder();

    const logger = createLogger({ transports: [sink.transport] });

    logger.info("m", {
      headers: new Map([["x", "1"]]) as never,
      tags: new Set(["a", "b"]) as never,
    });

    const metadata = sink.records[0]!["metadata"] as Record<string, unknown>;

    expect(metadata["headers"]).toEqual({ x: "1" });
    expect(metadata["tags"]).toEqual(["a", "b"]);
  });

  it("redacts a secret-named Map key", () => {
    const sink = recorder();

    const logger = createLogger({ transports: [sink.transport] });

    logger.info("m", {
      headers: new Map([
        ["authorization", "Bearer abc"],
        ["accept", "json"],
      ]) as never,
    });

    const metadata = sink.records[0]!["metadata"] as {
      headers: Record<string, unknown>;
    };

    expect(metadata.headers["authorization"]).toBe("[REDACTED]");
    expect(metadata.headers["accept"]).toBe("json");
  });

  it("serializes Map and Set through the JSON formatter", () => {
    const entry = createLoggerEntry({
      level: LoggerLevel.INFO,
      message: "m",
      metadata: {
        headers: new Map([["x", "1"]]),
        tags: new Set(["a"]),
      } as never,
    });

    const json = JSON.parse(createJsonLoggerFormatter().format(entry)) as {
      metadata: Record<string, unknown>;
    };

    expect(json.metadata["headers"]).toEqual({ x: "1" });
    expect(json.metadata["tags"]).toEqual(["a"]);
  });
});
