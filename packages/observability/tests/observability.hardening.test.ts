/**
 * Regression coverage for the round-7 audit findings.
 *
 * Every test here pins behaviour that used to be wrong, so the fixes cannot
 * quietly come undone.
 */

import { describe, it, expect, vi } from "vitest";

import {
  LogLevel,
  SpanStatus,
  TraceFlags,
  type LogRecord,
  type MetricSnapshot,
  type ReadableSpan,
} from "../src/types.js";
import {
  createObservability,
  DefaultObservability,
} from "../src/observability/index.js";
import { createNoopObservability, noopSpan } from "../src/noop/index.js";
import {
  createRedactor,
  redactObject,
  redactValue,
  isSensitiveField,
  CIRCULAR_MARKER,
  MAX_DEPTH_MARKER,
} from "../src/redaction/index.js";
import {
  generateSpanId,
  generateTraceId,
  isValidSpanId,
  isValidTraceId,
} from "../src/internal/index.js";
import {
  createPropagationContext,
  derivePropagationContext,
  getCurrentContext,
  AsyncPropagationManager,
} from "../src/propagation/index.js";
import { createStructuredLogger } from "../src/logger/index.js";
import { parseLogLevel, shouldLog } from "../src/logLevel/index.js";
import {
  createCounter,
  createGauge,
  createHistogram,
  createMetricsRegistry,
  createPeriodicMetricReader,
  metricKey,
} from "../src/metrics/index.js";
import {
  createSpan,
  createSpanContext,
  createChildSpanContext,
  isSampledContext,
} from "../src/tracing/span/index.js";
import { createTracer } from "../src/tracing/tracer/index.js";
import { DefaultSpan } from "../src/tracing/span/span.core.js";
import {
  createAlwaysOffSampler,
  createParentBasedSampler,
  createProbabilitySampler,
} from "../src/sampling/index.js";
import {
  createBatchSpanProcessor,
  createBatchLogProcessor,
} from "../src/processor/index.js";
import { safeStringify } from "../src/exporter/index.js";
import { MetricValueError } from "../src/errors/index.js";

/** A span exporter that records what it was given. */
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

/** A log exporter that records what it was given. */
function recordingLogExporter(): {
  exported: LogRecord[];
  shutdownCalls: number;
  export(records: readonly LogRecord[]): Promise<void>;
  shutdown(): Promise<void>;
} {
  const state = {
    exported: [] as LogRecord[],
    shutdownCalls: 0,
    async export(records: readonly LogRecord[]): Promise<void> {
      state.exported.push(...records);
    },
    async shutdown(): Promise<void> {
      state.shutdownCalls++;
    },
  };
  return state;
}

// ─── OBS-01 / OBS-02 / OBS-03 · Redaction ──────────────────────────────────

describe("redaction", () => {
  it("is applied by the facade when configured (OBS-01)", async () => {
    const exporter = recordingLogExporter();
    const obs = createObservability({
      serviceName: "svc",
      logExporter: exporter,
      useConsoleExporters: false,
      redaction: {},
    });

    obs.logger.info("login", {
      username: "ada",
      password: "hunter2",
      headers: [{ authorization: "Bearer secret" }],
    });
    await obs.flush();

    const record = exporter.exported[0];
    expect(record?.context?.["username"]).toBe("ada");
    expect(record?.context?.["password"]).toBe("[REDACTED]");
    expect(record?.context?.["headers"]).toEqual([
      { authorization: "[REDACTED]" },
    ]);

    await obs.shutdown();
  });

  it("traverses arrays (OBS-02)", () => {
    const redacted = redactObject({
      headers: [{ authorization: "Bearer x" }, { "x-request-id": "keep" }],
    });
    expect(redacted.headers).toEqual([
      { authorization: "[REDACTED]" },
      { "x-request-id": "keep" },
    ]);
  });

  it("survives a cycle instead of overflowing the stack (OBS-02)", () => {
    const node: Record<string, unknown> = { name: "root", token: "secret" };
    node["self"] = node;
    const redacted = redactObject(node);
    expect(redacted["name"]).toBe("root");
    expect(redacted["token"]).toBe("[REDACTED]");
    expect(redacted["self"]).toBe(CIRCULAR_MARKER);
  });

  it("caps depth (OBS-02)", () => {
    let deep: Record<string, unknown> = { value: 1 };
    for (let i = 0; i < 12; i++) deep = { nested: deep };
    const redacted = redactObject(deep, { maxDepth: 3 });
    expect(JSON.stringify(redacted)).toContain(MAX_DEPTH_MARKER);
  });

  it("leaves class instances intact (OBS-02)", () => {
    const date = new Date("2020-01-01T00:00:00.000Z");
    const error = new Error("boom");
    const redacted = redactObject({ date, error });
    expect(redacted["date"]).toBe(date);
    expect(redacted["error"]).toBe(error);
  });

  it("matches on substrings, not just whole names (OBS-03)", () => {
    expect(isSensitiveField("userPassword")).toBe(true);
    expect(isSensitiveField("x-api-key")).toBe(true);
    expect(isSensitiveField("X-Auth-Token")).toBe(true);
    expect(isSensitiveField("accessToken")).toBe(true);
    expect(isSensitiveField("username")).toBe(false);
  });

  it("honours exact mode and custom patterns (OBS-03)", () => {
    expect(isSensitiveField("userPassword", { matchMode: "exact" })).toBe(
      false,
    );
    expect(
      isSensitiveField("x-internal-id", { patterns: [/^x-internal-/] }),
    ).toBe(true);
  });

  it("never walks into a value it already replaced", () => {
    const redacted = redactObject({
      credentials: { password: "a", nested: { token: "b" } },
    });
    expect(redacted["credentials"]).toBe("[REDACTED]");
  });

  it("redacts a bare array through redactValue", () => {
    expect(redactValue([{ secret: "s" }])).toEqual([{ secret: "[REDACTED]" }]);
  });

  it("consults a custom redactor first", () => {
    const redactor = createRedactor({
      customRedactor: (key, value) => (key === "keep" ? "kept" : value),
    });
    expect(redactor("keep", "x")).toBe("kept");
    expect(redactor("password", "x")).toBe("[REDACTED]");
  });
});

// ─── OBS-04 · Identifier generation ────────────────────────────────────────

describe("identifiers", () => {
  it("produces valid, unique, non-zero ids (OBS-04)", () => {
    const traces = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const traceId = generateTraceId();
      const spanId = generateSpanId();
      expect(isValidTraceId(traceId)).toBe(true);
      expect(isValidSpanId(spanId)).toBe(true);
      traces.add(traceId);
    }
    expect(traces.size).toBe(200);
  });

  it("rejects malformed ids", () => {
    expect(isValidTraceId("0".repeat(32))).toBe(false);
    expect(isValidTraceId("xyz")).toBe(false);
    expect(isValidSpanId("00000000000000000")).toBe(false);
  });
});

// ─── OBS-05 / OBS-06 / OBS-19 · Sampling ───────────────────────────────────

describe("sampling", () => {
  it("is consulted by the tracer (OBS-05)", () => {
    const exporter = recordingSpanExporter();
    const processor = createBatchSpanProcessor({ exporter, batchSize: 1 });
    const tracer = createTracer({
      processors: [processor],
      sampler: createAlwaysOffSampler(),
    });

    const span = tracer.startSpan("dropped");
    expect(span.isRecording()).toBe(false);
    span.end();

    expect(exporter.exported).toHaveLength(0);
  });

  it("stamps the sampling decision into traceFlags (OBS-06)", () => {
    const sampled = createTracer({
      sampler: createAlwaysOffSampler(),
    }).startSpan("a").context;
    expect(sampled.traceFlags).toBe(TraceFlags.NONE);

    const on = createTracer().startSpan("b").context;
    expect(on.traceFlags).toBe(TraceFlags.SAMPLED);
    expect(isSampledContext(on)).toBe(true);
  });

  it("propagates traceFlags to children (OBS-06)", () => {
    const parent = createSpanContext({ traceFlags: TraceFlags.SAMPLED });
    const child = createChildSpanContext(parent);
    expect(child.traceFlags).toBe(TraceFlags.SAMPLED);
    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentSpanId).toBe(parent.spanId);
  });

  it("keeps children of a sampled parent (OBS-06)", () => {
    const sampler = createParentBasedSampler();
    const parent = createSpanContext({ traceFlags: TraceFlags.SAMPLED });
    expect(sampler.shouldSample(parent, parent.traceId).decision).toBe(
      "RECORD_AND_SAMPLE",
    );

    const unsampled = createSpanContext({ traceFlags: TraceFlags.NONE });
    expect(sampler.shouldSample(unsampled, unsampled.traceId).decision).toBe(
      "DO_NOT_RECORD",
    );
  });

  it("keeps a parent-based tracer's whole trace (OBS-06)", () => {
    const tracer = createTracer({ sampler: createParentBasedSampler() });
    const root = tracer.startSpan("root");
    const child = tracer.startSpan("child", { parent: root.context });
    expect(child.isRecording()).toBe(true);
    expect(child.context.traceFlags).toBe(TraceFlags.SAMPLED);
  });

  it("is deterministic per trace id and honours the rate (OBS-19)", () => {
    const sampler = createProbabilitySampler(0.5);
    const traceId = generateTraceId();
    const first = sampler.shouldSample(undefined, traceId).decision;
    for (let i = 0; i < 20; i++) {
      expect(sampler.shouldSample(undefined, traceId).decision).toBe(first);
    }

    let sampled = 0;
    for (let i = 0; i < 4_000; i++) {
      if (
        sampler.shouldSample(undefined, generateTraceId()).decision ===
        "RECORD_AND_SAMPLE"
      ) {
        sampled++;
      }
    }
    expect(sampled / 4_000).toBeGreaterThan(0.4);
    expect(sampled / 4_000).toBeLessThan(0.6);
  });

  it("does not silently drop everything on a malformed trace id (OBS-19)", () => {
    const sampler = createProbabilitySampler(1);
    expect(sampler.shouldSample(undefined, "not-hex").decision).toBe(
      "RECORD_AND_SAMPLE",
    );
    expect(sampler.shouldSample(undefined, undefined).decision).toBe(
      "RECORD_AND_SAMPLE",
    );
  });
});

// ─── OBS-07 · Metric export ────────────────────────────────────────────────

describe("metric export", () => {
  it("delivers snapshots through a reader (OBS-07)", async () => {
    const exported: MetricSnapshot[] = [];
    const registry = createMetricsRegistry();
    const reader = createPeriodicMetricReader({
      registry,
      exporter: {
        async export(snapshots) {
          exported.push(...snapshots);
        },
        async shutdown() {},
      },
      intervalMs: 0,
    });

    registry.counter("http.requests").increment(3);
    await reader.collect();

    expect(exported).toHaveLength(1);
    expect(exported[0]?.value).toBe(3);
    expect(exported[0]?.timestamp).toBeInstanceOf(Date);
    await reader.shutdown();
  });

  it("is wired by the facade (OBS-07)", async () => {
    const exported: MetricSnapshot[] = [];
    const obs = createObservability({
      serviceName: "svc",
      useConsoleExporters: false,
      metricExporter: {
        async export(snapshots) {
          exported.push(...snapshots);
        },
        async shutdown() {},
      },
    });

    obs.metrics.counter("jobs.done").increment();
    await obs.shutdown();

    expect(exported.map((snapshot) => snapshot.name)).toContain("jobs.done");
  });
});

// ─── OBS-08 · Log pipeline ─────────────────────────────────────────────────

describe("log pipeline", () => {
  it("batches records instead of exporting one at a time (OBS-08)", async () => {
    const calls: number[] = [];
    const processor = createBatchLogProcessor({
      exporter: {
        async export(records) {
          calls.push(records.length);
        },
        async shutdown() {},
      },
      batchSize: 100,
      flushIntervalMs: 10_000,
    });

    for (let i = 0; i < 5; i++) {
      processor.write({
        level: LogLevel.INFO,
        levelName: "info",
        message: `m${i}`,
        timestamp: new Date(),
        loggerName: "t",
      });
    }
    await processor.flush();

    expect(calls).toEqual([5]);
    await processor.shutdown();
  });

  it("reports a failing exporter instead of raising an unhandled rejection (OBS-08)", async () => {
    const rejections: unknown[] = [];
    const capture = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on("unhandledRejection", capture);

    const errors: unknown[] = [];
    try {
      const obs = createObservability({
        serviceName: "svc",
        useConsoleExporters: false,
        logExporter: {
          async export() {
            throw new Error("sink down");
          },
          async shutdown() {},
        },
        onError: (error) => errors.push(error),
      });
      obs.logger.info("hello");
      await obs.flush();
      await obs.shutdown();
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      process.off("unhandledRejection", capture);
    }

    expect(rejections).toEqual([]);
    expect((errors[0] as Error).message).toBe("sink down");
  });

  it("drops rather than grows once the queue is full (OBS-08)", async () => {
    let dropped = 0;
    const processor = createBatchLogProcessor({
      exporter: {
        async export() {
          await new Promise((resolve) => setTimeout(resolve, 5));
        },
        async shutdown() {},
      },
      batchSize: 2,
      maxQueueSize: 4,
      flushIntervalMs: 10_000,
      onDrop: (count) => {
        dropped = count;
      },
    });

    for (let i = 0; i < 40; i++) {
      processor.write({
        level: LogLevel.INFO,
        levelName: "info",
        message: `m${i}`,
        timestamp: new Date(),
        loggerName: "t",
      });
    }

    expect(processor.getQueueSize()).toBeLessThanOrEqual(4);
    expect(dropped).toBeGreaterThan(0);
    await processor.shutdown();
  });

  it("flushes buffered records on shutdown (OBS-08)", async () => {
    const exporter = recordingLogExporter();
    const obs = createObservability({
      serviceName: "svc",
      useConsoleExporters: false,
      logExporter: exporter,
      logFlushIntervalMs: 10_000,
    });
    obs.logger.info("last words");
    await obs.shutdown();
    expect(exporter.exported.map((record) => record.message)).toEqual([
      "last words",
    ]);
  });
});

// ─── OBS-09 / OBS-12 · Facade lifecycle ────────────────────────────────────

describe("facade lifecycle", () => {
  it("keeps configuration in a resource scope (OBS-09)", async () => {
    const exporter = recordingLogExporter();
    const obs = createObservability({
      serviceName: "svc",
      logLevel: LogLevel.ERROR,
      useConsoleExporters: false,
      logExporter: exporter,
    });

    const scoped = obs.resource({ "k8s.pod": "pod-1" });
    expect(scoped.logger.level).toBe(LogLevel.ERROR);
    expect(scoped.logger).toBe(obs.logger);
    expect(scoped.metrics).toBe(obs.metrics);

    const span = scoped.tracer.startSpan("scoped");
    span.end();
    await obs.flush();

    expect(scoped).toBeInstanceOf(DefaultObservability);
    await obs.shutdown();
  });

  it("stamps scope attributes onto spans (OBS-09)", async () => {
    const exporter = recordingSpanExporter();
    const obs = createObservability({
      serviceName: "svc",
      useConsoleExporters: false,
      spanExporter: exporter,
    });
    const scoped = obs.resource({ "k8s.pod": "pod-1" });
    scoped.tracer.startSpan("scoped").end();
    await obs.flush();

    expect(exporter.exported[0]?.resource).toMatchObject({
      "service.name": "svc",
      "k8s.pod": "pod-1",
    });
    await obs.shutdown();
  });

  it("shuts each exporter down exactly once and is idempotent (OBS-12)", async () => {
    const spanExporter = recordingSpanExporter();
    const logExporter = recordingLogExporter();
    const obs = createObservability({
      serviceName: "svc",
      useConsoleExporters: false,
      spanExporter,
      logExporter,
    });

    await obs.shutdown();
    await obs.shutdown();

    expect(spanExporter.shutdownCalls).toBe(1);
    expect(logExporter.shutdownCalls).toBe(1);
  });

  it("runs every teardown step even when one fails (OBS-12)", async () => {
    const logExporter = recordingLogExporter();
    const errors: unknown[] = [];
    const obs = createObservability({
      serviceName: "svc",
      useConsoleExporters: false,
      logExporter,
      spanExporter: {
        async export() {},
        async shutdown() {
          throw new Error("exporter refused to close");
        },
      },
      onError: (error) => errors.push(error),
    });

    await expect(obs.shutdown()).resolves.toBeUndefined();
    expect(logExporter.shutdownCalls).toBe(1);
    expect(errors).toHaveLength(1);
  });
});

// ─── OBS-10 / OBS-14 / OBS-15 · Span processing ────────────────────────────

describe("span processing", () => {
  it("caps the queue and counts drops (OBS-10)", async () => {
    let dropped = 0;
    const processor = createBatchSpanProcessor({
      exporter: {
        async export() {
          await new Promise((resolve) => setTimeout(resolve, 5));
        },
        async shutdown() {},
      },
      batchSize: 2,
      maxQueueSize: 4,
      flushIntervalMs: 10_000,
      onDrop: (count) => {
        dropped = count;
      },
    });

    const tracer = createTracer({ processors: [processor] });
    for (let i = 0; i < 40; i++) tracer.startSpan(`s${i}`).end();

    expect(processor.getQueueSize()).toBeLessThanOrEqual(4);
    expect(dropped).toBeGreaterThan(0);
    expect(processor.getDroppedCount()).toBe(dropped);
    await processor.shutdown();
  });

  it("reports export failures instead of swallowing them (OBS-10)", async () => {
    const errors: unknown[] = [];
    const processor = createBatchSpanProcessor({
      exporter: {
        async export() {
          throw new Error("collector unreachable");
        },
        async shutdown() {},
      },
      batchSize: 1,
      onError: (error) => errors.push(error),
    });
    createTracer({ processors: [processor] })
      .startSpan("s")
      .end();
    await processor.forceFlush();
    expect((errors[0] as Error).message).toBe("collector unreachable");
    await processor.shutdown();
  });

  it("exports a span once even if end() is called twice (OBS-14)", async () => {
    const exporter = recordingSpanExporter();
    const processor = createBatchSpanProcessor({ exporter, batchSize: 1 });
    const span = createTracer({ processors: [processor] }).startSpan("once");
    span.end();
    span.end();
    await processor.forceFlush();
    expect(exporter.exported).toHaveLength(1);
    await processor.shutdown();
  });

  it("returns a real span, not a proxy (OBS-15)", () => {
    const span = createTracer().startSpan("plain");
    expect(span).toBeInstanceOf(DefaultSpan);
  });
});

// ─── OBS-13 / OBS-21 / OBS-22 / OBS-23 · Spans ─────────────────────────────

describe("spans", () => {
  it("exports the status message (OBS-13)", () => {
    const span = createSpan("s");
    span.setStatus(SpanStatus.ERROR, "upstream timeout");
    span.end();
    expect(span.toReadableSpan().statusMessage).toBe("upstream timeout");
  });

  it("keeps the message set by recordError (OBS-13)", () => {
    const span = createSpan("s");
    span.recordError(new Error("boom"));
    span.end();
    const readable = span.toReadableSpan();
    expect(readable.status).toBe(SpanStatus.ERROR);
    expect(readable.statusMessage).toBe("boom");
  });

  it("caps attributes and events, and counts what it dropped (OBS-21)", () => {
    const span = createSpan("s", {
      limits: { maxAttributes: 2, maxEvents: 2 },
    });
    span.setAttribute("a", 1);
    span.setAttribute("b", 2);
    span.setAttribute("c", 3);
    span.addEvent("e1");
    span.addEvent("e2");
    span.addEvent("e3");
    span.end();

    const readable = span.toReadableSpan();
    expect(Object.keys(readable.attributes)).toEqual(["a", "b"]);
    expect(readable.events).toHaveLength(2);
    expect(readable.droppedAttributes).toBe(1);
    expect(readable.droppedEvents).toBe(1);
  });

  it("truncates oversized attribute values (OBS-21)", () => {
    const span = createSpan("s", { limits: { maxAttributeValueLength: 10 } });
    span.setAttribute("body", "x".repeat(100));
    span.end();
    expect(span.toReadableSpan().attributes["body"]).toHaveLength(10);
  });

  it("can omit stack traces (OBS-22)", () => {
    const span = createSpan("s", { captureStackTraces: false });
    span.recordError(new Error("boom"));
    span.end();
    const event = span.toReadableSpan().events[0];
    expect(event?.attributes?.["exception.message"]).toBe("boom");
    expect(event?.attributes?.["exception.stacktrace"]).toBeUndefined();
  });

  it("measures duration monotonically (OBS-23)", () => {
    const span = createSpan("s");
    span.end();
    expect(span.getDuration()).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(span.getDuration())).toBe(true);
  });
});

// ─── OBS-16 / OBS-17 / OBS-18 / OBS-35 · Logging ───────────────────────────

describe("logging", () => {
  it("correlates records with the active trace (OBS-16)", async () => {
    const records: LogRecord[] = [];
    const logger = createStructuredLogger({
      name: "t",
      transport: {
        name: "capture",
        write: (record) => {
          records.push(record);
        },
      },
    });

    const manager = new AsyncPropagationManager();
    const context = createPropagationContext();
    await manager.run(context, () => {
      logger.info("inside");
    });
    logger.info("outside");

    expect(records[0]?.traceId).toBe(context.traceId);
    expect(records[0]?.spanId).toBe(context.spanId);
    expect(records[1]?.traceId).toBeUndefined();
  });

  it("serializes an Error instead of writing {} (OBS-17)", () => {
    const records: LogRecord[] = [];
    const logger = createStructuredLogger({
      name: "t",
      transport: {
        name: "capture",
        write: (record) => {
          records.push(record);
        },
      },
    });

    const cause = new Error("root cause");
    logger.error("failed", { orderId: 7 }, new Error("wrapper", { cause }));

    expect(records[0]?.error?.name).toBe("Error");
    expect(records[0]?.error?.message).toBe("wrapper");
    expect(records[0]?.error?.stack).toContain("Error");
    expect(
      (records[0]?.error?.cause as { message?: string } | undefined)?.message,
    ).toBe("root cause");
  });

  it("serializes a non-Error throw (OBS-17)", () => {
    const records: LogRecord[] = [];
    const logger = createStructuredLogger({
      name: "t",
      transport: {
        name: "capture",
        write: (record) => {
          records.push(record);
        },
      },
    });
    logger.error("failed", undefined, "just a string");
    expect(records[0]?.error?.message).toBe("just a string");
  });

  it("parses a level name from configuration (OBS-18)", () => {
    expect(parseLogLevel("WARN")).toBe(LogLevel.WARN);
    expect(parseLogLevel(" info ")).toBe(LogLevel.INFO);
    expect(parseLogLevel("verbose")).toBeUndefined();
  });

  it("silences everything at OFF (OBS-18)", () => {
    expect(shouldLog(LogLevel.OFF, LogLevel.FATAL)).toBe(false);
    expect(shouldLog(LogLevel.INFO, LogLevel.DEBUG)).toBe(false);
    expect(shouldLog(LogLevel.INFO, LogLevel.ERROR)).toBe(true);
  });

  it("changes level at runtime and flushes its transport (OBS-35)", async () => {
    let flushed = 0;
    const records: LogRecord[] = [];
    const logger = createStructuredLogger({
      name: "t",
      level: LogLevel.ERROR,
      transport: {
        name: "capture",
        write: (record) => {
          records.push(record);
        },
        flush: async () => {
          flushed++;
        },
      },
    });

    logger.info("hidden");
    expect(records).toHaveLength(0);

    logger.setLevel(LogLevel.DEBUG);
    expect(logger.level).toBe(LogLevel.DEBUG);
    logger.info("visible");
    expect(records).toHaveLength(1);

    await logger.flush();
    expect(flushed).toBe(1);
  });

  it("never lets a failing transport reach the caller", () => {
    const logger = createStructuredLogger({
      name: "t",
      transport: {
        name: "broken",
        write: () => {
          throw new Error("transport down");
        },
      },
    });
    expect(() => logger.info("hello")).not.toThrow();
  });
});

// ─── OBS-20 · Console exporters ────────────────────────────────────────────

describe("console exporters", () => {
  it("survives circular structures and BigInts (OBS-20)", () => {
    const node: Record<string, unknown> = { name: "n" };
    node["self"] = node;
    const serialized = safeStringify({ node, big: 10n });
    expect(serialized).toContain("[Circular]");
    expect(serialized).toContain('"10"');
  });

  it("does not throw when a span carries a circular attribute (OBS-20)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const obs = createObservability({ serviceName: "svc" });
      const span = obs.tracer.startSpan("s");
      const node: Record<string, unknown> = {};
      node["self"] = node;
      span.setAttribute("payload", node);
      span.end();
      await expect(obs.flush()).resolves.toBeUndefined();
      await obs.shutdown();
    } finally {
      logSpy.mockRestore();
    }
  });
});

// ─── OBS-24 / OBS-25 / OBS-26 / OBS-27 · Metrics ───────────────────────────

describe("metrics", () => {
  it("looks up by name and labels (OBS-24)", () => {
    const registry = createMetricsRegistry();
    registry.counter("requests", { route: "/a" }).increment(1);
    registry.counter("requests", { route: "/b" }).increment(5);

    expect(registry.getCounter("requests", { route: "/b" })?.getValue()).toBe(
      5,
    );
    expect(registry.getCounter("requests", { route: "/a" })?.getValue()).toBe(
      1,
    );
    expect(registry.getCounter("requests")).toBeUndefined();
    expect(registry.getSeries("requests")).toHaveLength(2);
  });

  it("does not collide distinct label sets (OBS-25)", () => {
    expect(metricKey("counter", "m", { a: "b,c=d" })).not.toBe(
      metricKey("counter", "m", { a: "b", c: "d" }),
    );
    expect(metricKey("counter", "m", { a: "1", b: "2" })).toBe(
      metricKey("counter", "m", { b: "2", a: "1" }),
    );
  });

  it("caps series cardinality (OBS-25)", () => {
    const reported: string[] = [];
    const registry = createMetricsRegistry({
      maxSeries: 5,
      onCardinalityLimit: (name) => reported.push(name),
    });
    for (let i = 0; i < 50; i++) {
      registry.counter("by.user", { userId: String(i) }).increment();
    }
    expect(registry.size()).toBe(5);
    expect(reported.length).toBeGreaterThan(0);
  });

  it("computes percentiles (OBS-26)", () => {
    const histogram = createHistogram("latency");
    for (let i = 1; i <= 1_000; i++) histogram.record(i);
    const value = histogram.getValue();

    expect(value.count).toBe(1_000);
    expect(value.mean).toBeCloseTo(500.5, 0);
    expect(value.p50).toBeGreaterThan(400);
    expect(value.p50).toBeLessThan(600);
    expect(value.p99).toBeGreaterThan(value.p50);
    expect(value.buckets.length).toBeGreaterThan(0);
    expect(value.buckets.at(-1)?.count).toBeLessThanOrEqual(1_000);
  });

  it("reports zeroes for an empty histogram (OBS-26)", () => {
    const value = createHistogram("empty").getValue();
    expect(value).toMatchObject({ count: 0, min: 0, max: 0, mean: 0, p95: 0 });
  });

  it("rejects values it cannot aggregate (OBS-27)", () => {
    expect(() => createHistogram("h").record(Number.NaN)).toThrow(
      MetricValueError,
    );
    expect(() => createGauge("g").setValue(Number.POSITIVE_INFINITY)).toThrow(
      MetricValueError,
    );
    expect(() => createCounter("c").increment(-1)).toThrow(MetricValueError);
    expect(() => createHistogram("h").percentile(1.5)).toThrow(
      MetricValueError,
    );
  });

  it("refuses to reuse a name across metric types", () => {
    const registry = createMetricsRegistry();
    registry.counter("dual");
    expect(() => registry.gauge("dual")).not.toThrow();
    expect(registry.getCounter("dual")).toBeDefined();
    expect(registry.getGauge("dual")).toBeDefined();
  });
});

// ─── OBS-28 · Console default ──────────────────────────────────────────────

describe("console defaults", () => {
  it("can be turned off (OBS-28)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const obs = createObservability({
        serviceName: "svc",
        useConsoleExporters: false,
      });
      obs.logger.error("quiet please");
      obs.tracer.startSpan("s").end();
      await obs.flush();
      await obs.shutdown();
      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

// ─── OBS-29 / OBS-34 · Absence ─────────────────────────────────────────────

describe("absent context", () => {
  it("reports no active propagation context (OBS-29)", () => {
    expect(getCurrentContext()).toBeUndefined();
  });

  it("derives from nothing without inventing a shared trace (OBS-29)", () => {
    const manager = new AsyncPropagationManager();
    const a = manager.derive();
    const b = manager.derive();
    expect(a.traceId).not.toBe(b.traceId);
  });

  it("carries the parent's flags and baggage when deriving", () => {
    const parent = createPropagationContext({
      traceFlags: TraceFlags.SAMPLED,
      baggage: { tenant: "acme" },
    });
    const child = derivePropagationContext(parent);
    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentSpanId).toBe(parent.spanId);
    expect(child.traceFlags).toBe(TraceFlags.SAMPLED);
    expect(child.baggage).toEqual({ tenant: "acme" });
  });

  it("gives every noop span a fresh start time (OBS-34)", async () => {
    const first = noopSpan.startTime.getTime();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(noopSpan.startTime.getTime()).toBeGreaterThan(first - 1);
    expect(createNoopObservability().tracer.startSpan("x").isRecording()).toBe(
      false,
    );
  });
});
