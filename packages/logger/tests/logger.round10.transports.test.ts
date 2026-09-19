/**
 * Round-10 audit regression tests for @zudojs/logger transports and
 * the logger lifecycle.
 */

import { describe, it, expect } from "vitest";

import {
  createBufferedLoggerTransport,
  createConditionalLoggerTransport,
  createLogger,
  createMultiLoggerTransport,
} from "../src/index.js";
import type { LoggerEntry, LoggerTransport } from "../src/index.js";

function sink(name = "sink"): { got: string[]; closed: () => boolean; transport: LoggerTransport } {
  const got: string[] = [];
  let closed = false;
  return {
    got,
    closed: () => closed,
    transport: {
      name,
      enabled: true,
      write: (entry: LoggerEntry) => void got.push(entry.message),
      close: () => void (closed = true),
    },
  };
}

const failing: LoggerTransport = {
  name: "down",
  enabled: true,
  write() {
    throw new Error("remote down");
  },
};

describe("LOG-02", () => {
  it("multi and conditional forward flush/close to nested buffered transports", async () => {
    const a = sink("a");
    const b = sink("b");
    const logger = createLogger({
      transports: [
        createMultiLoggerTransport([createBufferedLoggerTransport(a.transport, { flushInterval: 60_000 })]),
        createConditionalLoggerTransport(createBufferedLoggerTransport(b.transport, { flushInterval: 60_000 }), () => true),
      ],
    });
    logger.info("shutdown-critical");
    await logger.close();
    expect(a.got).toHaveLength(1);
    expect(b.got).toHaveLength(1);
    expect(a.closed()).toBe(true);
    expect(b.closed()).toBe(true);
  });

  it("one failing sink does not starve the others", async () => {
    const ok = sink("ok");
    const multi = createMultiLoggerTransport([failing, ok.transport]);
    const logger = createLogger({ transports: [multi] });
    logger.info("m");
    await logger.flush();
    expect(ok.got).toHaveLength(1);
    await expect(multi.close?.()).resolves.toBeUndefined();
  });
});

describe("LOG-03", () => {
  it("a timer flush failure loses only the failed entry and is rethrown by flush()", async () => {
    const got: string[] = [];
    let calls = 0;
    const inner: LoggerTransport = {
      name: "inner",
      enabled: true,
      write(entry) {
        calls += 1;
        if (calls === 1) throw new Error("sink hiccup");
        got.push(entry.message);
      },
    };
    const logger = createLogger({
      transports: [createBufferedLoggerTransport(inner, { flushInterval: 5 })],
      throwTransportErrors: true,
    });
    for (const m of ["one", "two", "three"]) logger.info(m);
    await new Promise((r) => setTimeout(r, 40));
    expect(got).toHaveLength(2);
    await expect(logger.flush()).rejects.toThrow("sink hiccup");
    await expect(logger.flush()).resolves.toBeUndefined();
  });
});

describe("LOG-04", () => {
  it("close() closes every transport and disposes even when one fails", async () => {
    const b = sink("b");
    const a: LoggerTransport = {
      name: "a",
      enabled: true,
      write() {},
      flush() {
        throw new Error("a flush failed");
      },
    };
    const logger = createLogger({ transports: [a, b.transport] });
    await expect(logger.close()).rejects.toThrow("a flush failed");
    expect(b.closed()).toBe(true);
    expect(() => logger.info("after")).toThrow(/disposed/u);
  });

  it("several failures surface as one AggregateError", async () => {
    const bad = (name: string): LoggerTransport => ({
      name,
      enabled: true,
      write() {},
      close() {
        throw new Error(`${name} close failed`);
      },
    });
    const logger = createLogger({ transports: [bad("x"), bad("y")] });
    const error = await logger.close().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toHaveLength(2);
  });

  it("flush() still flushes later transports when an earlier one fails", async () => {
    let flushed = false;
    const logger = createLogger({
      transports: [
        { name: "a", enabled: true, write() {}, flush() { throw new Error("nope"); } },
        { name: "b", enabled: true, write() {}, flush() { flushed = true; } },
      ],
    });
    await expect(logger.flush()).rejects.toThrow("nope");
    expect(flushed).toBe(true);
  });
});
