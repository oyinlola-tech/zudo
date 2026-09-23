/**
 * @zudojs/observability — batch 5 bug reports.
 *
 * One describe block per report.
 */

import { describe, it, expect } from "vitest";

import { DEFAULT_LOGGER_SECRET_FIELDS } from "@zudojs/logger";

import { createObservability, isSensitiveField } from "../src/index.js";
import type {
  LogRecord,
  MetricSnapshot,
  ObservabilityConfig,
  ReadableSpan,
} from "../src/index.js";

function capture(extra: Partial<ObservabilityConfig> = {}) {
  const records: LogRecord[] = [];
  const spans: ReadableSpan[] = [];
  const obs = createObservability({
    serviceName: "batch5",
    useConsoleExporters: false,
    logExporter: {
      export: async (batch) => {
        records.push(...batch);
      },
      shutdown: async () => {},
    },
    spanExporter: {
      export: async (batch) => {
        spans.push(...batch);
      },
      shutdown: async () => {},
    },
    ...extra,
  });
  return { obs, records, spans };
}

describe("redaction is on by default", () => {
  it("redacts a password in a log context without any redaction config", async () => {
    const { obs, records } = capture();
    obs.logger.info("login", { user: "ada", password: "hunter2" });
    await obs.shutdown();

    expect(records[0]?.context?.["password"]).toBe("[REDACTED]");
    expect(records[0]?.context?.["user"]).toBe("ada");
    expect(JSON.stringify(records)).not.toContain("hunter2");
  });

  it("redacts span attributes without any redaction config", async () => {
    const { obs, spans } = capture();
    const span = obs.tracer.startSpan("op");
    span.setAttribute("authorization", "Bearer abc");
    span.addEvent("auth", { token: "t-secret" });
    span.end();
    await obs.shutdown();

    expect(spans[0]?.attributes["authorization"]).toBe("[REDACTED]");
    expect(spans[0]?.events[0]?.attributes?.["token"]).toBe("[REDACTED]");
  });

  it("covers every name @zudojs/logger redacts by default", () => {
    for (const field of DEFAULT_LOGGER_SECRET_FIELDS) {
      expect(isSensitiveField(field)).toBe(true);
    }
    for (const key of ["jwt", "bearerToken", "sid", "passphrase", "userpassword"]) {
      expect(isSensitiveField(key)).toBe(true);
    }
    expect(isSensitiveField("shippingAddress")).toBe(false);
    expect(isSensitiveField("authorId")).toBe(false);
  });

  it("redaction: false opts out", async () => {
    const { obs, records } = capture({ redaction: false });
    obs.logger.info("login", { password: "hunter2" });
    await obs.shutdown();
    expect(records[0]?.context?.["password"]).toBe("hunter2");
  });

  it("an explicit field list still replaces the defaults", async () => {
    const { obs, records } = capture({ redaction: { fields: ["ssn"] } });
    obs.logger.info("x", { ssn: "1", password: "p" });
    await obs.shutdown();
    expect(records[0]?.context?.["ssn"]).toBe("[REDACTED]");
    expect(records[0]?.context?.["password"]).toBe("p");
  });
});

describe("shutdown exports the final metric snapshot once", () => {
  it("calls the metric exporter exactly once on shutdown", async () => {
    const batches: (readonly MetricSnapshot[])[] = [];
    const obs = createObservability({
      serviceName: "batch5",
      useConsoleExporters: false,
      metricExportIntervalMs: 0,
      metricExporter: {
        export: async (snapshots) => {
          batches.push(snapshots);
        },
        shutdown: async () => {},
      },
    });
    obs.metrics.counter("orders").increment(2);

    await obs.shutdown();

    expect(batches).toHaveLength(1);
    expect(batches[0]?.map((s) => s.name)).toEqual(["orders"]);
  });

  it("flush() still exports a snapshot", async () => {
    const batches: (readonly MetricSnapshot[])[] = [];
    const obs = createObservability({
      serviceName: "batch5",
      useConsoleExporters: false,
      metricExportIntervalMs: 0,
      metricExporter: {
        export: async (snapshots) => {
          batches.push(snapshots);
        },
        shutdown: async () => {},
      },
    });
    obs.metrics.counter("orders").increment();
    await obs.flush();
    expect(batches).toHaveLength(1);
    await obs.shutdown();
    expect(batches).toHaveLength(2);
  });
});
