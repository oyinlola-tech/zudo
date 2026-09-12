/**
 * @zudojs/observability — Round 9 regression tests.
 *
 * One describe block per finding.
 */

import { describe, it, expect } from "vitest";

import {
  createObservability,
  redactValue,
  redactObject,
} from "../src/index.js";
import type { LogRecord, ReadableSpan } from "../src/index.js";

/* ─── OBSERVABILITY-R9-01: class instances bypassed redaction entirely ──── */

describe("OBSERVABILITY-R9-01", () => {
  class LoginDto {
    constructor(
      readonly username: string,
      readonly password: string,
    ) {}

    display(): string {
      return this.username;
    }
  }

  it("redacts the own fields of a user-defined class instance", () => {
    const redacted = redactValue({ body: new LoginDto("ada", "hunter2") }) as {
      body: LoginDto;
    };

    expect(redacted.body.password).toBe("[REDACTED]");
    expect(redacted.body.username).toBe("ada");
    // Rebuilt on the same prototype: instanceof and methods survive.
    expect(redacted.body).toBeInstanceOf(LoginDto);
    expect(redacted.body.display()).toBe("ada");
    expect(JSON.parse(JSON.stringify(redacted))).toEqual({
      body: { username: "ada", password: "[REDACTED]" },
    });
  });

  it("still leaves built-ins intact", () => {
    const when = new Date(0);
    const err = new Error("boom");
    const map = new Map([["password", "x"]]);
    const bytes = new Uint8Array([1, 2]);
    const result = redactObject({ when, err, map, bytes, re: /x/ });

    expect(result.when).toBe(when);
    expect(result.err).toBe(err);
    expect(result.map).toBe(map);
    expect(result.bytes).toBe(bytes);
    expect(result.re).toBeInstanceOf(RegExp);
  });

  it("redacts a class instance in a log context before any exporter sees it", async () => {
    const records: LogRecord[] = [];
    const obs = createObservability({
      serviceName: "r9",
      useConsoleExporters: false,
      redaction: {},
      logExporter: {
        export: async (batch) => {
          records.push(...batch);
        },
        shutdown: async () => {},
      },
    });

    obs.logger.info("login", { body: new LoginDto("ada", "hunter2") });
    await obs.shutdown();

    expect(JSON.stringify(records[0]?.context)).not.toContain("hunter2");
    expect((records[0]?.context?.["body"] as LoginDto).password).toBe(
      "[REDACTED]",
    );
  });

  it("redacts a class instance set as a span attribute", async () => {
    const spans: ReadableSpan[] = [];
    const obs = createObservability({
      serviceName: "r9",
      useConsoleExporters: false,
      redaction: {},
      spanExporter: {
        export: async (batch) => {
          spans.push(...batch);
        },
        shutdown: async () => {},
      },
    });

    const span = obs.tracer.startSpan("login");
    span.setAttribute("request", new LoginDto("ada", "hunter2"));
    span.end();
    await obs.shutdown();

    expect(JSON.stringify(spans[0]?.attributes)).not.toContain("hunter2");
  });
});
