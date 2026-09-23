/**
 * Round-10 audit regression tests for @zudojs/logger: formatting,
 * redaction and child loggers. Transport tests live in
 * logger.round10.transports.test.ts.
 */

import { describe, it, expect } from "vitest";

import {
  createLogger,
  createJsonLoggerFormatter,
  createLoggerEntry,
  createSecretMatcher,
  createTextLoggerFormatter,
  escapeLogText,
  LoggerLevel,
} from "../src/index.js";
import type { LoggerEntry } from "../src/index.js";

const RECORD = /^\d{4}-\d{2}-\d{2}T\S+ \[[A-Z]+\]/u;

describe("LOG-01", () => {
  const forged = "2026-09-19T00:00:00.000Z [INFO] [app] admin login ok";
  const format = (error: Error, includeStackTrace = true): string =>
    createTextLoggerFormatter({ includeStackTrace }).format(
      createLoggerEntry({ level: LoggerLevel.ERROR, message: "failed", error }),
      {},
    );

  it("a newline in an error message cannot forge a record via the stack", () => {
    const out = format(new Error(`bad user bob\n${forged}`));
    const lines = out.split("\n");
    expect(lines.filter((line) => RECORD.test(line))).toHaveLength(1);
    expect(out).toContain("bad user bob\\n2026-09-19");
  });

  it("every stack continuation line is indented, even for custom stacks", () => {
    const error = new Error("x");
    error.stack = `Error: x\n${forged}\n    at f (a.js:1:1)`;
    const lines = format(error).split("\n").slice(2);
    for (const line of lines) expect(line).toMatch(/^\s/u);
  });

  it("C1 controls, DEL and U+2028/2029 are escaped too", () => {
    expect(escapeLogText("a\u0085b\u009bc\u007fd\u2028e\u2029")).toBe(
      "a\\x85b\\x9bc\\x7fd\\u2028e\\u2029",
    );
    const out = format(new Error("m\u2028x"), false);
    expect(out).not.toMatch(/[\u2028\u0085]/u);
  });

  it("quoted metadata values escape DEL and line separators", () => {
    const out = createTextLoggerFormatter().format(
      createLoggerEntry({
        level: LoggerLevel.INFO,
        message: "m",
        metadata: { v: "a b\u2028c\u007f" },
      }),
      {},
    );
    expect(out).not.toMatch(/[\u2028\u007f]/u);
  });
});

describe("LOG-06", () => {
  const isSecret = createSecretMatcher();

  it("redacts common credential fields the old pattern missed", () => {
    for (const key of ["auth", "jwt", "sessionId", "sid", "ssn", "cardNumber", "cvv", "otp"]) {
      expect(isSecret(key), key).toBe(true);
    }
  });

  it("keeps the old coverage", () => {
    for (const key of ["dbPassword", "X-Api-Key", "refresh_token", "userpassword", "accesstoken", "cookie"]) {
      expect(isSecret(key), key).toBe(true);
    }
  });

  it("no longer redacts innocent fields that merely contain `pass`", () => {
    for (const key of ["passenger", "compass", "bypassCache", "authorId", "shippingAddress"]) {
      expect(isSecret(key), key).toBe(false);
    }
  });

  it("the logger applies the default end to end", async () => {
    const out: string[] = [];
    const logger = createLogger({
      formatter: createJsonLoggerFormatter(),
      transports: [{ name: "c", enabled: true, write: (e: LoggerEntry) => void out.push(e.formatted ?? e.message) }],
    });
    logger.info("req", { auth: "Basic dXNlcjpodW50ZXIy", passenger: "Ada" });
    await logger.flush();
    const metadata = JSON.parse(out[0]!).metadata as Record<string, unknown>;
    expect(metadata.auth).toBe("[REDACTED]");
    expect(metadata.passenger).toBe("Ada");
  });
});

describe("LOG-05", () => {
  it("root close() drains in-flight child entries before closing", async () => {
    const written: string[] = [];
    let closed = false;
    const root = createLogger({
      transports: [
        {
          name: "slow",
          enabled: true,
          async write() {
            await new Promise((r) => setTimeout(r, 20));
            written.push(closed ? "AFTER-CLOSE" : "ok");
          },
          close() {
            closed = true;
          },
        },
      ],
    });
    const child = root.child({ name: "child" });
    child.info("during shutdown");
    await root.close();
    expect(written).toEqual(["ok"]);
    expect(closed).toBe(true);
  });

  it("a child reports itself disposed once its root is closed", async () => {
    const root = createLogger({ transports: [] });
    const child = root.child({ name: "child" });
    const grandchild = child.child({ name: "gc" });
    await root.close();
    expect(() => child.info("x")).toThrow(/disposed/u);
    expect(() => grandchild.info("x")).toThrow(/disposed/u);
    expect(child.enabled).toBe(false);
  });
});
