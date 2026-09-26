/**
 * Round 12 (academy findings) — @zudojs/logger.
 *
 * #67  An Error nested in metadata (`{ cause: new Error("x") }`) reached
 *      transports as the live Error object, whose fields are
 *      non-enumerable, so a transport that stringified `entry.metadata`
 *      logged `"cause":{}`. It is now normalized to plain data when the
 *      entry is built. `logger.error(message, err)` keeps working at
 *      runtime; the typed form is `log(level, message, { error })`.
 * #118 Redaction is on by default here (documented; `createLogRedactor`
 *      belongs to @zudojs/core's ConsoleLogger).
 */

import { describe, expect, it } from "vitest";

import {
  LOGGER_ERROR_VALUE,
  LoggerLevel,
  createJsonLoggerFormatter,
  createLogger,
  createTextLoggerFormatter,
  isLogErrorValue,
  redactLogValue,
} from "../src/index.js";
import type { LoggerEntry } from "../src/index.js";

function capture(): {
  readonly entries: LoggerEntry[];
  readonly transport: (entry: LoggerEntry) => void;
} {
  const entries: LoggerEntry[] = [];
  return { entries, transport: (entry) => void entries.push(entry) };
}

class HttpError extends Error {
  readonly status = 500;
  readonly token = "secret-value";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "HttpError";
  }
}

describe("#67 an Error nested in metadata is plain data on the entry", () => {
  it("survives JSON.stringify(entry.metadata) in a custom transport", async () => {
    const { entries, transport } = capture();
    const logger = createLogger({ name: "t", transports: [transport] });

    logger.error("nested", {
      cause: new Error("x"),
      deep: { inner: new Error("y") },
      list: [new Error("z")],
    });
    await logger.flush();

    const json = JSON.parse(JSON.stringify(entries[0]?.metadata)) as {
      cause: { name: string; message: string; stack: string };
      deep: { inner: { message: string } };
      list: [{ message: string }];
    };
    expect(json.cause.name).toBe("Error");
    expect(json.cause.message).toBe("x");
    expect(json.cause.stack).toContain("Error: x");
    expect(json.deep.inner.message).toBe("y");
    expect(json.list[0].message).toBe("z");
  });

  it("keeps own fields, redacts secret-named ones and follows cause", async () => {
    const { entries, transport } = capture();
    const logger = createLogger({ name: "t", transports: [transport] });

    logger.warn("http", {
      err: new HttpError("upstream", { cause: new Error("root") }),
    });
    await logger.flush();

    const err = entries[0]?.metadata["err"] as Record<string, unknown>;
    expect(isLogErrorValue(err)).toBe(true);
    expect(err).toMatchObject({
      name: "HttpError",
      message: "upstream",
      status: 500,
      token: "[REDACTED]",
      cause: { name: "Error", message: "root" },
    });
    expect(Object.keys(err)).not.toContain(LOGGER_ERROR_VALUE);
    expect(JSON.stringify(err)).not.toContain("errorValue");
  });

  it("turns a self-referential cause into [Circular]", () => {
    const error = new Error("loop") as Error & { cause: unknown };
    error.cause = error;
    const value = redactLogValue({ error }, () => false) as {
      error: { cause: unknown };
    };
    expect(value.error.cause).toBe("[Circular]");
  });

  it("is still rendered by the built-in formatters, honouring includeStackTrace", async () => {
    const { entries, transport } = capture();
    const json = createLogger({
      name: "t",
      formatter: createJsonLoggerFormatter(),
      transports: [transport],
    });
    json.error("nested", { cause: new Error("x") });
    await json.flush();
    expect(String(entries[0]?.formatted)).toContain(
      '"cause":{"name":"Error","message":"x","stack":"Error: x',
    );

    const text = createLogger({
      name: "t",
      formatter: createTextLoggerFormatter({ includeStackTrace: false }),
      transports: [transport],
    });
    text.error("nested", { cause: new Error("x") });
    await text.flush();
    const line = String(entries[1]?.formatted);
    expect(line).toContain('cause={"name":"Error","message":"x"}');
    expect(line).not.toContain("stack");
  });

  it("normalizes errors even with redaction disabled", async () => {
    const { entries, transport } = capture();
    const logger = createLogger({
      name: "t",
      redact: false,
      transports: [transport],
    });
    logger.info("plain", { err: new HttpError("no-redaction") });
    await logger.flush();
    expect(entries[0]?.metadata["err"]).toMatchObject({
      message: "no-redaction",
      token: "secret-value",
    });
  });

  it("logs an Error passed as the second argument as the entry error", async () => {
    const { entries, transport } = capture();
    const logger = createLogger({ name: "t", transports: [transport] });
    const boom = new Error("boom");

    // The typed signature takes metadata; JavaScript and loosely typed
    // callers pass the error itself and must not lose it.
    (logger.error as (message: string, value: unknown) => void)(
      "failed",
      boom,
    );
    logger.log(LoggerLevel.ERROR, "typed", { error: boom, metadata: { a: 1 } });
    await logger.flush();

    expect(entries[0]?.error).toBe(boom);
    expect(entries[1]?.error).toBe(boom);
    expect(entries[1]?.metadata).toMatchObject({ a: 1 });
  });
});

describe("#118 redaction is on by default", () => {
  it("masks password/token/authorization without any configuration", async () => {
    const { entries, transport } = capture();
    const logger = createLogger({ name: "t", transports: [transport] });
    logger.info("login", {
      password: "p",
      token: "t",
      headers: { authorization: "Bearer x", accept: "json" },
    });
    await logger.flush();
    expect(entries[0]?.metadata).toEqual({
      password: "[REDACTED]",
      token: "[REDACTED]",
      headers: { authorization: "[REDACTED]", accept: "json" },
    });
  });
});
