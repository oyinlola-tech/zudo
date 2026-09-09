/**
 * Regression coverage for the round-8 audit findings.
 *
 * These are adversarial by design: a metric label built from a user id, a
 * secret-shaped header attached to a span, a span that is never ended, a
 * histogram configured with a boundary that poisons every quantile.
 */

import { describe, it, expect, vi } from "vitest";

import { LogLevel, type MetricSnapshot, type ReadableSpan } from "../src/types.js";
import { createObservability } from "../src/observability/index.js";
import { createMetricsRegistry } from "../src/metrics/index.js";
import { createHistogram } from "../src/metrics/histogram/index.js";
import { createTracer } from "../src/tracing/tracer/index.js";
import { createBatchSpanProcessor } from "../src/processor/index.js";
import { safeStringify } from "../src/exporter/index.js";
import { isSensitiveField, redactObject } from "../src/redaction/index.js";
import { getLogLevelNames } from "../src/logLevel/index.js";
import {
  MetricValueError,
  ObservabilityConfigError,
} from "../src/errors/index.js";

function recordingSpanExporter(): {
  exported: ReadableSpan[];
  shutdownCalls: number;
  export(spans: readonly ReadableSpan[]): Promise<void>;
  shutdown(): Promise<void>;
} {
  const state = {
    exported: [] as ReadableSpan[],
    shutdownCalls: 0,
    async export(spans: readonly ReadableSpan[]): Promise<void> {
      state.exported.push(...spans);
    },
    async shutdown(): Promise<void> {
      state.shutdownCalls++;
    },
  };
  return state;
}

function recordingMetricExporter(): {
  exported: MetricSnapshot[];
  shutdownCalls: number;
  export(snapshots: readonly MetricSnapshot[]): Promise<void>;
  shutdown(): Promise<void>;
} {
  const state = {
    exported: [] as MetricSnapshot[],
    shutdownCalls: 0,
    async export(snapshots: readonly MetricSnapshot[]): Promise<void> {
      state.exported.push(...snapshots);
    },
    async shutdown(): Promise<void> {
      state.shutdownCalls++;
    },
  };
  return state;
}

// ─── OBS-31 · Secrets on spans ─────────────────────────────────────────────

describe("span redaction", () => {
  it("redacts secret-shaped span attributes when the facade is configured", async () => {
    const exporter = recordingSpanExporter();
    const obs = createObservability({
      serviceName: "svc",
      useConsoleExporters: false,
      spanExporter: exporter,
      redaction: {},
    });

    const span = obs.tracer.startSpan("handle-request");
    span.setAttribute("http.request.header.authorization", "Bearer sk-live-42");
    span.setAttribute("x-api-key", "ak_secret");
    span.setAttribute("http.route", "/orders/{id}");
    span.setAttribute("request", {
      body: { password: "hunter2" },
      method: "POST",
    });
    span.end();

    await obs.shutdown();

    const exported = exporter.exported[0];
    expect(exported).toBeDefined();
    const attributes = exported?.attributes ?? {};
    expect(attributes["http.request.header.authorization"]).toBe("[REDACTED]");
    expect(attributes["x-api-key"]).toBe("[REDACTED]");
    // Non-sensitive attributes survive untouched.
    expect(attributes["http.route"]).toBe("/orders/{id}");
    // A secret nested inside an innocuous attribute is caught too.
    expect(attributes["request"]).toEqual({
      body: { password: "[REDACTED]" },
      method: "POST",
    });

    const serialized = safeStringify(exported);
    expect(serialized).not.toContain("sk-live-42");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("ak_secret");
  });

  it("redacts span event attributes, including a recorded error's fields", async () => {
    const exporter = recordingSpanExporter();
    const obs = createObservability({
      serviceName: "svc",
      useConsoleExporters: false,
      spanExporter: exporter,
      redaction: {},
    });

    const span = obs.tracer.startSpan("op");
    span.addEvent("auth", { token: "t-secret", attempt: 1 });
    span.end();
    await obs.shutdown();

    const event = exporter.exported[0]?.events[0];
    expect(event?.attributes?.["token"]).toBe("[REDACTED]");
    expect(event?.attributes?.["attempt"]).toBe(1);
  });

  it("leaves attributes alone when no redaction is configured", async () => {
    const exporter = recordingSpanExporter();
    const obs = createObservability({
      serviceName: "svc",
      useConsoleExporters: false,
      spanExporter: exporter,
    });
    const span = obs.tracer.startSpan("op");
    span.setAttribute("token", "plain");
    span.end();
    await obs.shutdown();
    expect(exporter.exported[0]?.attributes["token"]).toBe("plain");
  });
});

// ─── OBS-32 · Metric cardinality ───────────────────────────────────────────

describe("metric cardinality", () => {
  it("bounds a label built from a user-supplied value", () => {
    const reported: string[] = [];
    const registry = createMetricsRegistry({
      maxSeries: 8,
      onCardinalityLimit: (name) => reported.push(name),
    });

    // The classic backend-DoS shape: an unbounded id in a label.
    for (let i = 0; i < 5_000; i++) {
      registry.counter("http.requests", { userId: `user-${i}` }).increment();
    }

    expect(registry.size()).toBe(8);
    expect(reported.length).toBeGreaterThan(0);
    // The detached-series cache is bounded too, so the documented ceiling is
    // not quietly doubled.
    expect(registry.getAll().length).toBe(8);
  });

  it("exposes the series cap through the facade's configuration", () => {
    const obs = createObservability({
      serviceName: "svc",
      useConsoleExporters: false,
      metrics: { maxSeries: 3 },
    });
    for (let i = 0; i < 100; i++) {
      obs.metrics.counter("by.path", { path: `/orders/${i}` }).increment();
    }
    expect(obs.metrics.size()).toBe(3);
  });

  it("reports a cardinality blow-up through onError", () => {
    const errors: string[] = [];
    const obs = createObservability({
      serviceName: "svc",
      useConsoleExporters: false,
      metrics: { maxSeries: 2 },
      onError: (error) =>
        errors.push(error instanceof Error ? error.message : String(error)),
    });
    for (let i = 0; i < 10; i++) {
      obs.metrics.counter("by.user", { userId: String(i) }).increment();
    }
    expect(errors.some((message) => message.includes("high-cardinality"))).toBe(
      true,
    );
  });

  it("rejects one name registered as two metric types", () => {
    const registry = createMetricsRegistry();
    registry.counter("latency");
    expect(() => registry.histogram("latency")).toThrow(
      ObservabilityConfigError,
    );
  });
});

// ─── OBS-33 · Histogram configuration ──────────────────────────────────────

describe("histogram boundaries", () => {
  it("rejects a non-finite boundary instead of returning NaN quantiles", () => {
    expect(() => createHistogram("h", undefined, [1, Number.NaN, 5])).toThrow(
      MetricValueError,
    );
    expect(() => createHistogram("h", undefined, [1, Infinity])).toThrow(
      MetricValueError,
    );
  });

  it("rejects an empty boundary list", () => {
    expect(() => createHistogram("h", undefined, [])).toThrow(MetricValueError);
  });

  it("sorts and de-duplicates the boundaries it is given", () => {
    const histogram = createHistogram("h", undefined, [10, 1, 10, 5]);
    histogram.record(3);
    const buckets = histogram.getValue().buckets;
    expect(buckets.map((bucket) => bucket.le)).toEqual([1, 5, 10]);
    expect(Number.isFinite(histogram.percentile(0.95))).toBe(true);
  });
});

// ─── OBS-34 · Serialization fidelity ───────────────────────────────────────

describe("safeStringify", () => {
  it("keeps a value referenced twice instead of calling it circular", () => {
    const user = { id: "u1", name: "Ada" };
    const output = safeStringify({ actor: user, subject: user });
    expect(output).not.toContain("[Circular]");
    expect(JSON.parse(output)).toEqual({ actor: user, subject: user });
  });

  it("still replaces a genuine cycle", () => {
    const node: Record<string, unknown> = { name: "root" };
    node["self"] = node;
    expect(safeStringify(node)).toContain("[Circular]");
  });

  it("keeps a repeated element in an array", () => {
    const shared = { k: 1 };
    expect(safeStringify([shared, shared, shared])).toBe(
      '[{"k":1},{"k":1},{"k":1}]',
    );
  });
});

// ─── OBS-35 · Redaction precision ──────────────────────────────────────────

describe("redaction word boundaries", () => {
  it("does not redact a field that merely contains a listed term", () => {
    // `shipping` contains `pin`; `authorId` contains `auth`.
    expect(isSensitiveField("shippingAddress")).toBe(false);
    expect(isSensitiveField("shipping")).toBe(false);
    expect(isSensitiveField("authorId")).toBe(false);
    expect(isSensitiveField("author")).toBe(false);
    expect(isSensitiveField("username")).toBe(false);
    expect(isSensitiveField("description")).toBe(false);
  });

  it("still redacts every real secret shape", () => {
    for (const field of [
      "password",
      "userPassword",
      "passwords",
      "x-api-key",
      "apiKey",
      "API_KEY",
      "accessToken",
      "X-Auth-Token",
      "authorization",
      "refresh_token",
      "clientSecret",
      "cookie",
      "cardNumber",
      "cvv",
      "otp",
      "pin",
    ]) {
      expect(isSensitiveField(field), field).toBe(true);
    }
  });

  it("keeps the distinction inside a nested log context", () => {
    expect(
      redactObject({
        order: { shippingAddress: "1 Main St", authorId: "a-1" },
        auth: { token: "t", apiKey: "k" },
      }),
    ).toEqual({
      order: { shippingAddress: "1 Main St", authorId: "a-1" },
      auth: "[REDACTED]",
    });
  });
});

// ─── OBS-36 · Metric export lifecycle ──────────────────────────────────────

describe("metric export lifecycle", () => {
  it("still exports and closes the exporter when the interval is disabled", async () => {
    const exporter = recordingMetricExporter();
    const obs = createObservability({
      serviceName: "svc",
      useConsoleExporters: false,
      metricExporter: exporter,
      metricExportIntervalMs: 0,
    });

    obs.metrics.counter("jobs.done").increment(3);
    expect(exporter.exported.length).toBe(0);

    await obs.shutdown();

    expect(exporter.exported.map((snapshot) => snapshot.name)).toContain(
      "jobs.done",
    );
    expect(exporter.shutdownCalls).toBe(1);
  });

  it("drains metrics through flush without shutting anything down", async () => {
    const exporter = recordingMetricExporter();
    const obs = createObservability({
      serviceName: "svc",
      useConsoleExporters: false,
      metricExporter: exporter,
      metricExportIntervalMs: 0,
    });
    obs.metrics.gauge("queue.depth").setValue(7);

    await obs.flush();
    expect(exporter.exported.length).toBeGreaterThan(0);
    expect(exporter.shutdownCalls).toBe(0);

    await obs.shutdown();
  });

  it("flushes from a resource scope rather than silently doing nothing", async () => {
    const exporter = recordingMetricExporter();
    const obs = createObservability({
      serviceName: "svc",
      useConsoleExporters: false,
      metricExporter: exporter,
      metricExportIntervalMs: 0,
      logLevel: LogLevel.INFO,
    });

    const scope = obs.resource({ "k8s.pod": "pod-1" });
    scope.metrics.counter("scoped.events").increment();

    await scope.flush();
    expect(exporter.exported.map((snapshot) => snapshot.name)).toContain(
      "scoped.events",
    );

    await obs.shutdown();
  });
});

// ─── OBS-37 · Span lifetime ────────────────────────────────────────────────

describe("unended spans", () => {
  it("does not retain a span that is never ended", async () => {
    const exporter = recordingSpanExporter();
    const processor = createBatchSpanProcessor({ exporter });
    const tracer = createTracer({ processors: [processor] });

    for (let i = 0; i < 1_000; i++) {
      // Deliberately leaked: no `end()`.
      tracer.startSpan(`leaked-${i}`);
    }

    expect(processor.getQueueSize()).toBe(0);
    await processor.forceFlush();
    expect(exporter.exported.length).toBe(0);

    await processor.shutdown();
  });

  it("clears its flush timer on shutdown", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const exporter = recordingSpanExporter();
    const processor = createBatchSpanProcessor({
      exporter,
      flushIntervalMs: 10_000,
    });
    const tracer = createTracer({ processors: [processor] });
    tracer.startSpan("op").end();

    await processor.shutdown();
    expect(clearSpy).toHaveBeenCalled();
    expect(exporter.shutdownCalls).toBe(1);
    clearSpy.mockRestore();
  });
});

// ─── OBS-38 · Shared immutable state ───────────────────────────────────────

describe("module singletons", () => {
  it("hands out a frozen level-name list", () => {
    const names = getLogLevelNames();
    expect(Object.isFrozen(names)).toBe(true);
    expect(() => (names as string[]).push("bogus")).toThrow();
    expect(getLogLevelNames()).toContain("info");
  });
});
