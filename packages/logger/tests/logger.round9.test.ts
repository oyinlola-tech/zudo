/**
 * Round-9 audit regression tests for @zudojs/logger.
 *
 * One describe block per finding id.
 */

import { describe, it, expect } from "vitest";

import {
  createLogger,
  createLoggerContext,
  createTextLoggerFormatter,
  createJsonLoggerFormatter,
  createBufferedLoggerTransport,
  createLoggerEntry,
  createSecretMatcher,
  LoggerLevel,
  LoggerTransportError,
} from "../src/index.js";
import type { LoggerEntry, LoggerTransport } from "../src/index.js";

function arrayTransport(): {
  entries: LoggerEntry[];
  transport: LoggerTransport;
} {
  const entries: LoggerEntry[] = [];
  return {
    entries,
    transport: {
      name: "array",
      enabled: true,
      write(entry) {
        entries.push(entry);
      },
    },
  };
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("LOG-R9-01: a redaction pattern with the g/y flag redacts every entry", () => {
  it("createSecretMatcher is stateless for a /g pattern", () => {
    const isSecret = createSecretMatcher({ pattern: /token/gi });
    expect([1, 2, 3, 4].map(() => isSecret("token"))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it("consecutive entries never leak a secret-named field", () => {
    const { entries, transport } = arrayTransport();
    const logger = createLogger({
      transports: [transport],
      redact: { pattern: /token/gi },
      formatter: createJsonLoggerFormatter(),
    });
    logger.info("a", { token: "s1" });
    logger.info("b", { token: "s2" });
    logger.info("c", { token: "s3" });
    expect(entries.map((e) => e.metadata["token"])).toEqual([
      "[REDACTED]",
      "[REDACTED]",
      "[REDACTED]",
    ]);
  });
});

describe("LOG-R9-02: per-call context reaches every formatter", () => {
  it("appears in text output and in entry.metadata", () => {
    const { entries, transport } = arrayTransport();
    const logger = createLogger({
      transports: [transport],
      formatter: createTextLoggerFormatter(),
    });
    logger.log(LoggerLevel.INFO, "hello", { context: { tenant: "acme" } });
    expect(entries[0]!.message).toContain("tenant=acme");
    expect(entries[0]!.metadata["tenant"]).toBe("acme");
  });

  it("is redacted like any other metadata", () => {
    const { entries, transport } = arrayTransport();
    const logger = createLogger({ transports: [transport] });
    logger.log(LoggerLevel.INFO, "login", {
      context: { password: "hunter2" },
    });
    expect(entries[0]!.metadata["password"]).toBe("[REDACTED]");
    expect(entries[0]!.context?.metadata?.["password"]).toBe("[REDACTED]");
  });

  it("explicit per-call metadata wins over per-call context", () => {
    const { entries, transport } = arrayTransport();
    const logger = createLogger({ transports: [transport] });
    logger.log(LoggerLevel.INFO, "x", {
      context: { tenant: "ctx" },
      metadata: { tenant: "meta" },
    });
    expect(entries[0]!.metadata["tenant"]).toBe("meta");
  });
});

describe("LOG-R9-03: entry.context carries the active context identifiers", () => {
  it("a transport can read entry.context.requestId", () => {
    const { entries, transport } = arrayTransport();
    const logger = createLogger({ transports: [transport] });
    logger
      .withContext(
        createLoggerContext({ requestId: "req-1", traceId: "trace-1" }),
      )
      .info("handled");
    expect(entries[0]!.context?.requestId).toBe("req-1");
    expect(entries[0]!.context?.traceId).toBe("trace-1");
    // The documented channel is unchanged.
    expect(entries[0]!.metadata["requestId"]).toBe("req-1");
  });

  it("the text formatter does not print an identifier twice", () => {
    const { entries, transport } = arrayTransport();
    const logger = createLogger({
      transports: [transport],
      formatter: createTextLoggerFormatter(),
    });
    logger
      .withContext(createLoggerContext({ requestId: "req-1" }))
      .info("handled");
    const line = entries[0]!.message;
    expect(line.split("requestId=req-1").length - 1).toBe(1);
  });

  it("the text formatter still prints identifiers that are not in metadata", () => {
    const formatter = createTextLoggerFormatter({ includeTimestamp: false });
    const entry = createLoggerEntry({
      level: LoggerLevel.INFO,
      message: "m",
      context: { requestId: "req-9" },
    });
    expect(formatter.format(entry, {})).toContain("[requestId=req-9]");
  });
});

describe("LOG-R9-04: throwTransportErrors surfaces asynchronous transport failures", () => {
  function failingAsyncTransport(): LoggerTransport {
    return {
      name: "boom",
      enabled: true,
      async write() {
        throw new Error("disk full");
      },
    };
  }

  it("flush() rejects with the transport error", async () => {
    const logger = createLogger({
      throwTransportErrors: true,
      transports: [failingAsyncTransport()],
    });
    logger.info("x");
    await expect(logger.flush()).rejects.toBeInstanceOf(LoggerTransportError);
    // Surfaced once, not again on the next flush.
    await expect(logger.flush()).resolves.toBeUndefined();
  });

  it("asynchronous: true with a synchronous throwing transport is surfaced too", async () => {
    const logger = createLogger({
      throwTransportErrors: true,
      asynchronous: true,
      transports: [
        {
          name: "boom",
          enabled: true,
          write() {
            throw new Error("sync boom");
          },
        },
      ],
    });
    logger.info("x");
    await expect(logger.flush()).rejects.toThrow(/sync boom/);
  });

  it("several failures are reported together", async () => {
    const logger = createLogger({
      throwTransportErrors: true,
      transports: [failingAsyncTransport()],
    });
    logger.info("a");
    logger.info("b");
    await expect(logger.flush()).rejects.toBeInstanceOf(AggregateError);
  });

  it("close() still closes the transports, marks the logger disposed, then rethrows", async () => {
    let closed = 0;
    const logger = createLogger({
      throwTransportErrors: true,
      transports: [
        {
          ...failingAsyncTransport(),
          close() {
            closed += 1;
          },
        },
      ],
    });
    logger.info("x");
    await expect(logger.close()).rejects.toBeInstanceOf(LoggerTransportError);
    expect(closed).toBe(1);
    expect(() => logger.info("after")).toThrow(/disposed/);
  });

  it("stays silent when throwTransportErrors is off", async () => {
    const logger = createLogger({ transports: [failingAsyncTransport()] });
    logger.info("x");
    await expect(logger.flush()).resolves.toBeUndefined();
  });
});

describe("LOG-R9-05: the buffered transport's flush timer does not keep the process alive", () => {
  it("unrefs the scheduled flush timer", async () => {
    let unrefCalled = false;
    const original = globalThis.setTimeout;
    const patched = ((handler: () => void, ms?: number) => {
      const timer = original(handler, ms);
      const timerWithUnref = timer as unknown as { unref?: () => void };
      const realUnref = timerWithUnref.unref?.bind(timer);
      timerWithUnref.unref = () => {
        unrefCalled = true;
        realUnref?.();
      };
      return timer;
    }) as unknown as typeof setTimeout;
    globalThis.setTimeout = patched;
    try {
      const transport = createBufferedLoggerTransport(
        { name: "sink", enabled: true, write() {} },
        { flushInterval: 50 },
      );
      await transport.write(
        createLoggerEntry({ level: LoggerLevel.INFO, message: "m" }),
      );
      expect(unrefCalled).toBe(true);
      await transport.close?.();
    } finally {
      globalThis.setTimeout = original;
    }
  });

  it("close() still delivers what the timer had not flushed yet", async () => {
    const delivered: LoggerEntry[] = [];
    const transport = createBufferedLoggerTransport(
      {
        name: "sink",
        enabled: true,
        write(entry) {
          delivered.push(entry);
        },
      },
      { flushInterval: 10_000 },
    );
    await transport.write(
      createLoggerEntry({ level: LoggerLevel.INFO, message: "m" }),
    );
    expect(delivered).toHaveLength(0);
    await transport.close?.();
    expect(delivered).toHaveLength(1);
  });
});

describe("LOG-R9-06: concurrent close() calls close each transport once", () => {
  it("shares the in-flight closure", async () => {
    let closes = 0;
    const logger = createLogger({
      transports: [
        {
          name: "t",
          enabled: true,
          write() {},
          async close() {
            closes += 1;
            await tick();
          },
        },
      ],
    });
    await Promise.all([logger.close(), logger.close()]);
    expect(closes).toBe(1);
    await expect(logger.close()).resolves.toBeUndefined();
    expect(closes).toBe(1);
  });
});
