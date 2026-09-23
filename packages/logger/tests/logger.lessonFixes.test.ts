/**
 * Regressions reported by lesson writers against the published package:
 * one JSON line per structured record, a raw `entry.message`, level names
 * in configuration, and `includeStackTrace: false` hiding every stack.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createConsoleLoggerTransport,
  createJsonLoggerFormatter,
  createLogger,
  createLoggerEntry,
  createStructuredLoggerFormatter,
  createTextLoggerFormatter,
  InvalidLoggerLevelError,
  LoggerConfigurationError,
  LoggerLevel,
  resolveLoggerLevel,
} from "../src/index.js";
import type { LoggerEntry } from "../src/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function captureConsole(): unknown[] {
  const lines: unknown[] = [];
  for (const method of ["info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((value: unknown) => {
      lines.push(value);
    });
  }
  return lines;
}

function sink(): { readonly entries: LoggerEntry[]; readonly write: (e: LoggerEntry) => void } {
  const entries: LoggerEntry[] = [];
  return { entries, write: (entry) => void entries.push(entry) };
}

describe("structured formatter on the console transport", () => {
  it("prints one JSON line per record, surviving cycles and bigint", () => {
    const lines = captureConsole();
    const logger = createLogger({
      name: "svc",
      formatter: createStructuredLoggerFormatter(),
      transports: [createConsoleLoggerTransport()],
    });
    const cyclic: Record<string, unknown> = { id: 1 };
    cyclic["self"] = cyclic;

    logger.info("order placed", { order: cyclic, total: 10n, note: "a\nb" });

    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(typeof line).toBe("string");
    expect(String(line)).not.toContain("\n");
    const record = JSON.parse(String(line)) as Record<string, unknown>;
    expect(record["message"]).toBe("order placed");
    expect(record["levelName"]).toBe("info");
    expect(record["metadata"]).toEqual({
      order: { id: 1, self: "[Circular]" },
      total: "10",
      note: "a\nb",
    });
  });

  it("prints a raw entry written straight to the transport as one JSON line", () => {
    const lines = captureConsole();
    const transport = createConsoleLoggerTransport();
    const entry = createLoggerEntry({ level: LoggerLevel.WARN, message: "direct" });

    void transport.transport.write?.(entry, {});

    expect(JSON.parse(String(lines[0]))).toMatchObject({ level: "warn", message: "direct" });
  });
});

describe("entry.message stays the raw message", () => {
  it("carries the text formatter's line in entry.formatted only", () => {
    const { entries, write } = sink();
    const logger = createLogger({ name: "svc", transports: [write] });

    logger.warn("careful", { userId: "u1" });

    expect(entries[0]!.message).toBe("careful");
    expect(entries[0]!.formatted).toMatch(/\[WARN\] \[svc\] careful userId=u1$/u);
  });

  it("carries a JSON formatter's line in entry.formatted", () => {
    const { entries, write } = sink();
    const logger = createLogger({ formatter: createJsonLoggerFormatter(), transports: [write] });

    logger.info("hello");

    expect(entries[0]!.message).toBe("hello");
    expect(JSON.parse(entries[0]!.formatted!)).toMatchObject({ message: "hello" });
  });

  it("carries a structured record's JSON line in entry.formatted", () => {
    const { entries, write } = sink();
    const logger = createLogger({ formatter: createStructuredLoggerFormatter(), transports: [write] });

    logger.error("boom");

    expect(entries[0]!.message).toBe("boom");
    expect(JSON.parse(entries[0]!.formatted!)).toMatchObject({ message: "boom", levelName: "error" });
  });
});

describe("level names in configuration", () => {
  it("accepts a lower- or upper-case name in the options", () => {
    const { entries, write } = sink();
    const quiet = createLogger({ level: "error", transports: [write] });
    quiet.warn("dropped");
    quiet.error("kept");
    expect(quiet.level).toBe(LoggerLevel.ERROR);
    expect(entries.map((e) => e.message)).toEqual(["kept"]);

    expect(createLogger({ level: "DEBUG", transports: [write] }).level).toBe(LoggerLevel.DEBUG);
    expect(createLogger({ level: LoggerLevel.WARN, transports: [write] }).level).toBe(LoggerLevel.WARN);
  });

  it("accepts a name in setLevel and child", () => {
    const logger = createLogger({ transports: [sink().write] });
    logger.setLevel("trace");
    expect(logger.level).toBe(LoggerLevel.TRACE);
    logger.setLevel("Warn" as "warn");
    expect(logger.level).toBe(LoggerLevel.WARN);
    expect(logger.child({ level: "fatal" }).level).toBe(LoggerLevel.FATAL);
    expect(logger.child().level).toBe(LoggerLevel.WARN);
  });

  it("rejects an unknown name instead of silently logging nothing", () => {
    expect(() => createLogger({ level: "verbose" as "info" })).toThrow(InvalidLoggerLevelError);
    expect(() => createLogger({ level: 9 as LoggerLevel })).toThrow(InvalidLoggerLevelError);
    const logger = createLogger({ transports: [sink().write] });
    expect(() => logger.setLevel("loud" as "info")).toThrow(LoggerConfigurationError);
    expect(() => logger.child({ level: "nope" as "info" })).toThrow(InvalidLoggerLevelError);
  });

  it("resolveLoggerLevel maps names and aliases", () => {
    expect(resolveLoggerLevel("ERROR")).toBe(LoggerLevel.ERROR);
    expect(resolveLoggerLevel("warning" as "warn")).toBe(LoggerLevel.WARN);
    expect(resolveLoggerLevel(LoggerLevel.TRACE)).toBe(LoggerLevel.TRACE);
  });
});

describe("includeStackTrace: false", () => {
  const error = new Error("card declined");
  error.stack = "Error: card declined\n    at charge (/home/me/app/src/pay.ts:10:5)";

  const format = (entry: Parameters<typeof createLoggerEntry>[0]): string =>
    createTextLoggerFormatter({ includeStackTrace: false }).format(createLoggerEntry(entry), {});

  it("prints the error's name and message only", () => {
    const line = format({ level: LoggerLevel.ERROR, message: "failed", error });
    expect(line).toMatch(/failed error=\{"name":"Error","message":"card declined"\}$/u);
    expect(line).not.toContain("/home/me");
    expect(line).not.toContain("stack");
  });

  it("drops the stack of an Error carried in metadata too", () => {
    const line = format({ level: LoggerLevel.ERROR, message: "failed", metadata: { cause: error } });
    expect(line).toContain('"message":"card declined"');
    expect(line).not.toContain("/home/me");
  });

  it("keeps the stack by default", () => {
    const line = createTextLoggerFormatter().format(
      createLoggerEntry({ level: LoggerLevel.ERROR, message: "failed", error }),
      {},
    );
    expect(line).toContain("/home/me/app/src/pay.ts");
  });
});
