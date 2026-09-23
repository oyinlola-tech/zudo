/**
 * Regression tests for post-release logger fixes.
 */

import { describe, it, expect } from "vitest";

import { createLogger, resolveLoggerOptions } from "../src/index.js";
import type { LoggerEntry, LoggerOptions } from "../src/index.js";

function metadataFor(options: LoggerOptions): Record<string, unknown> {
  const records: LoggerEntry[] = [];
  const logger = createLogger({
    ...options,
    transports: [(entry: LoggerEntry) => void records.push(entry)],
  });
  logger.info("login", { user: "alice", password: "hunter2" });
  return records[0]!.metadata as Record<string, unknown>;
}

describe("post-release — redact: false disables redaction", () => {
  it("redact: false logs the secret-named field as is", () => {
    expect(metadataFor({ redact: false })["password"]).toBe("hunter2");
  });

  it("redact: false is inherited by a child logger", () => {
    const records: LoggerEntry[] = [];
    const logger = createLogger({
      redact: false,
      transports: [(entry: LoggerEntry) => void records.push(entry)],
    });
    logger.child({ name: "api" }).info("x", { token: "t" });
    expect((records[0]!.metadata as Record<string, unknown>)["token"]).toBe(
      "t",
    );
  });

  it("redact: true keeps the default redaction", () => {
    expect(metadataFor({ redact: true })["password"]).toBe("[REDACTED]");
  });

  it("omitting redact keeps the default redaction", () => {
    expect(metadataFor({})["password"]).toBe("[REDACTED]");
  });

  it("the object form still works", () => {
    expect(metadataFor({ redact: { enabled: false } })["password"]).toBe(
      "hunter2",
    );
    expect(metadataFor({ redact: { replacement: "***" } })["password"]).toBe(
      "***",
    );
  });

  it("resolves the boolean into the object form on the configuration", () => {
    expect(resolveLoggerOptions({ redact: false }).redact).toEqual({
      enabled: false,
    });
    expect(resolveLoggerOptions({ redact: true }).redact).toEqual({});
    expect(Object.isFrozen(resolveLoggerOptions({}).redact)).toBe(true);
  });
});
