/**
 * @zudojs/observability — Tests
 *
 * Comprehensive tests for logging, metrics, tracing, propagation,
 * sampling, exporters, redaction, and noop implementations.
 */

import { describe, it, expect, vi } from "vitest";

import { LogLevel, SpanStatus, SpanKind } from "../src/types.js";
import { MetricValueError } from "../src/errors/index.js";

import {
  logLevelToName,
  logLevelFromName,
  shouldLog,
  getLogLevelNames,
} from "../src/logLevel/index.js";

import {
  createLogRecord,
  createErrorLogRecord,
} from "../src/logRecord/index.js";
import {
  StructuredLogger,
  createStructuredLogger,
} from "../src/logger/index.js";
import {
  createPropagationContext,
  derivePropagationContext,
  AsyncPropagationManager,
} from "../src/propagation/index.js";
import {
  createCounter,
  createGauge,
  createHistogram,
  createMetricsRegistry,
} from "../src/metrics/index.js";
import {
  createSpan,
  createSpanContext,
  createChildSpanContext,
} from "../src/tracing/span/index.js";
import { createTracer } from "../src/tracing/tracer/index.js";
import {
  AlwaysOnSampler,
  AlwaysOffSampler,
  ProbabilitySampler,
  ParentBasedSampler,
} from "../src/sampling/index.js";
import {
  ConsoleSpanExporter,
  ConsoleLogExporter,
  ConsoleMetricExporter,
} from "../src/exporter/index.js";
import { createBatchSpanProcessor } from "../src/processor/index.js";
import {
  createRedactor,
  redactObject,
  isSensitiveField,
} from "../src/redaction/index.js";
import {
  NoopObservability,
  createNoopObservability,
} from "../src/noop/index.js";
import { createObservability } from "../src/observability/index.js";

// ─── Log Level ──────────────────────────────────────────────────────────

describe("LogLevel", () => {
  it("converts level to name", () => {
    expect(logLevelToName(LogLevel.TRACE)).toBe("trace");
    expect(logLevelToName(LogLevel.DEBUG)).toBe("debug");
    expect(logLevelToName(LogLevel.INFO)).toBe("info");
    expect(logLevelToName(LogLevel.WARN)).toBe("warn");
    expect(logLevelToName(LogLevel.ERROR)).toBe("error");
    expect(logLevelToName(LogLevel.FATAL)).toBe("fatal");
    expect(logLevelToName(LogLevel.OFF)).toBe("off");
  });

  it("converts name to level", () => {
    expect(logLevelFromName("trace")).toBe(LogLevel.TRACE);
    expect(logLevelFromName("debug")).toBe(LogLevel.DEBUG);
    expect(logLevelFromName("info")).toBe(LogLevel.INFO);
    expect(logLevelFromName("warn")).toBe(LogLevel.WARN);
    expect(logLevelFromName("error")).toBe(LogLevel.ERROR);
    expect(logLevelFromName("fatal")).toBe(LogLevel.FATAL);
    expect(logLevelFromName("off")).toBe(LogLevel.OFF);
  });

  it("shouldLog respects hierarchy", () => {
    expect(shouldLog(LogLevel.INFO, LogLevel.ERROR)).toBe(true);
    expect(shouldLog(LogLevel.INFO, LogLevel.WARN)).toBe(true);
    expect(shouldLog(LogLevel.INFO, LogLevel.DEBUG)).toBe(false);
    expect(shouldLog(LogLevel.DEBUG, LogLevel.INFO)).toBe(true);
  });

  it("shouldLog allows same level", () => {
    expect(shouldLog(LogLevel.INFO, LogLevel.INFO)).toBe(true);
  });

  it("getLogLevelNames returns all names", () => {
    expect(getLogLevelNames()).toHaveLength(7);
  });
});

// ─── Log Record ─────────────────────────────────────────────────────────

describe("LogRecord", () => {
  it("creates a log record", () => {
    const record = createLogRecord({
      level: LogLevel.INFO,
      message: "test message",
      loggerName: "test",
    });
    expect(record.level).toBe(LogLevel.INFO);
    expect(record.levelName).toBe("info");
    expect(record.message).toBe("test message");
    expect(record.loggerName).toBe("test");
    expect(record.timestamp).toBeInstanceOf(Date);
  });

  it("creates a log record with context", () => {
    const record = createLogRecord({
      level: LogLevel.WARN,
      message: "warning",
      loggerName: "test",
      context: { userId: "123" },
    });
    expect(record.context).toEqual({ userId: "123" });
  });

  it("creates an error log record", () => {
    const error = new Error("boom");
    const record = createErrorLogRecord(error, LogLevel.ERROR, "test");
    expect(record.level).toBe(LogLevel.ERROR);
    expect(record.error).toBeDefined();
    expect(record.error!.message).toBe("boom");
  });
});

// ─── Logger ─────────────────────────────────────────────────────────────

describe("StructuredLogger", () => {
  it("creates a logger with default level", () => {
    const logger = createStructuredLogger({ name: "test" });
    expect(logger.name).toBe("test");
    expect(logger.level).toBe(LogLevel.INFO);
  });

  it("creates a logger with custom level", () => {
    const logger = createStructuredLogger({
      name: "test",
      level: LogLevel.DEBUG,
    });
    expect(logger.level).toBe(LogLevel.DEBUG);
  });

  it("logs messages at or above threshold", () => {
    const transport = { name: "test", write: vi.fn() };
    const logger = createStructuredLogger({
      name: "test",
      level: LogLevel.WARN,
      transport,
    });

    logger.debug("should not appear");
    logger.info("should not appear");
    logger.warn("should appear");
    logger.error("should appear");

    expect(transport.write).toHaveBeenCalledTimes(2);
  });

  it("isLevelEnabled checks threshold", () => {
    const logger = createStructuredLogger({
      name: "test",
      level: LogLevel.INFO,
    });
    expect(logger.isLevelEnabled(LogLevel.INFO)).toBe(true);
    expect(logger.isLevelEnabled(LogLevel.DEBUG)).toBe(false);
    expect(logger.isLevelEnabled(LogLevel.ERROR)).toBe(true);
  });

  it("creates child logger with merged context", () => {
    const logger = createStructuredLogger({
      name: "app",
      level: LogLevel.DEBUG,
      context: { service: "api" },
    });
    const child = logger.child("http", { requestId: "r1" });

    expect(child.name).toBe("app.http");
    expect(child).toBeInstanceOf(StructuredLogger);
  });

  it("child logger inherits parent level", () => {
    const logger = createStructuredLogger({
      name: "app",
      level: LogLevel.ERROR,
    });
    const child = logger.child("sub");
    expect(child.isLevelEnabled(LogLevel.WARN)).toBe(false);
    expect(child.isLevelEnabled(LogLevel.ERROR)).toBe(true);
  });
});

// ─── Propagation ────────────────────────────────────────────────────────

describe("PropagationContext", () => {
  it("creates a context with generated IDs", () => {
    const ctx = createPropagationContext();
    expect(ctx.traceId).toBeTruthy();
    expect(ctx.spanId).toBeTruthy();
    expect(ctx.traceId.length).toBe(32);
    expect(ctx.spanId.length).toBe(16);
  });

  it("creates a context with custom IDs", () => {
    const ctx = createPropagationContext({
      traceId: "abc123",
      spanId: "def456",
      requestId: "req1",
    });
    expect(ctx.traceId).toBe("abc123");
    expect(ctx.spanId).toBe("def456");
    expect(ctx.requestId).toBe("req1");
  });

  it("derives a child context", () => {
    const parent = createPropagationContext({ traceId: "trace1" });
    const child = derivePropagationContext(parent);
    expect(child.traceId).toBe("trace1");
    expect(child.parentSpanId).toBe(parent.spanId);
    expect(child.spanId).not.toBe(parent.spanId);
  });

  it("derives with overrides", () => {
    const parent = createPropagationContext({ traceId: "trace1" });
    const child = derivePropagationContext(parent, { correlationId: "corr1" });
    expect(child.correlationId).toBe("corr1");
    expect(child.traceId).toBe("trace1");
  });
});

describe("AsyncPropagationManager", () => {
  it("runs function with context", async () => {
    const manager = new AsyncPropagationManager();
    const ctx = createPropagationContext({ requestId: "req1" });

    await manager.run(ctx, () => {
      const current = manager.current();
      expect(current?.requestId).toBe("req1");
    });
  });

  it("derives context from current", async () => {
    const manager = new AsyncPropagationManager();
    const ctx = createPropagationContext({ traceId: "t1", requestId: "r1" });

    await manager.run(ctx, () => {
      const derived = manager.derive({ correlationId: "c1" });
      expect(derived.traceId).toBe("t1");
      expect(derived.requestId).toBe("r1");
      expect(derived.correlationId).toBe("c1");
    });
  });
});

// ─── Metrics ────────────────────────────────────────────────────────────

describe("Counter", () => {
  it("increments from zero", () => {
    const counter = createCounter("test.counter");
    expect(counter.getValue()).toBe(0);
    counter.increment();
    expect(counter.getValue()).toBe(1);
  });

  it("increments by custom value", () => {
    const counter = createCounter("test.counter");
    counter.increment(5);
    expect(counter.getValue()).toBe(5);
  });

  it("rejects a negative increment instead of ignoring it", () => {
    const counter = createCounter("test.counter");
    expect(() => counter.increment(-1)).toThrow(MetricValueError);
    expect(counter.getValue()).toBe(0);
  });

  it("rejects non-finite increments", () => {
    const counter = createCounter("test.counter");
    expect(() => counter.increment(Number.NaN)).toThrow(MetricValueError);
    expect(() => counter.increment(Number.POSITIVE_INFINITY)).toThrow(
      MetricValueError,
    );
    expect(counter.getValue()).toBe(0);
  });

  it("resets to zero", () => {
    const counter = createCounter("test.counter");
    counter.increment(10);
    counter.reset();
    expect(counter.getValue()).toBe(0);
  });

  it("stores labels", () => {
    const counter = createCounter("test.counter", { method: "GET" });
    expect(counter.labels).toEqual({ method: "GET" });
  });
});

describe("Gauge", () => {
  it("sets value", () => {
    const gauge = createGauge("test.gauge");
    gauge.setValue(42);
    expect(gauge.getValue()).toBe(42);
  });

  it("increments and decrements", () => {
    const gauge = createGauge("test.gauge");
    gauge.setValue(10);
    gauge.increment(3);
    expect(gauge.getValue()).toBe(13);
    gauge.decrement(5);
    expect(gauge.getValue()).toBe(8);
  });

  it("resets", () => {
    const gauge = createGauge("test.gauge");
    gauge.setValue(100);
    gauge.reset();
    expect(gauge.getValue()).toBe(0);
  });
});

describe("Histogram", () => {
  it("records values", () => {
    const hist = createHistogram("test.hist");
    hist.record(10);
    hist.record(20);
    hist.record(30);
    const value = hist.getValue();
    expect(value.count).toBe(3);
    expect(value.sum).toBe(60);
    expect(value.min).toBe(10);
    expect(value.max).toBe(30);
  });

  it("returns zeros for no records", () => {
    const hist = createHistogram("test.hist");
    const value = hist.getValue();
    expect(value.count).toBe(0);
    expect(value.min).toBe(0);
    expect(value.max).toBe(0);
  });

  it("resets", () => {
    const hist = createHistogram("test.hist");
    hist.record(100);
    hist.reset();
    expect(hist.getValue().count).toBe(0);
  });
});

describe("MetricsRegistry", () => {
  it("creates and caches counters", () => {
    const registry = createMetricsRegistry();
    const c1 = registry.counter("requests");
    const c2 = registry.counter("requests");
    expect(c1).toBe(c2);
  });

  it("creates and caches gauges", () => {
    const registry = createMetricsRegistry();
    const g1 = registry.gauge("connections");
    const g2 = registry.gauge("connections");
    expect(g1).toBe(g2);
  });

  it("creates and caches histograms", () => {
    const registry = createMetricsRegistry();
    const h1 = registry.histogram("latency");
    const h2 = registry.histogram("latency");
    expect(h1).toBe(h2);
  });

  it("separates by labels", () => {
    const registry = createMetricsRegistry();
    const c1 = registry.counter("req", { method: "GET" });
    const c2 = registry.counter("req", { method: "POST" });
    expect(c1).not.toBe(c2);
  });

  it("getAll returns snapshots", () => {
    const registry = createMetricsRegistry();
    registry.counter("c1").increment(5);
    registry.gauge("g1").setValue(10);
    const snapshots = registry.getAll();
    expect(snapshots.length).toBe(2);
  });

  it("getCounter/getGauge/getHistogram find by name", () => {
    const registry = createMetricsRegistry();
    registry.counter("my_counter");
    registry.gauge("my_gauge");
    registry.histogram("my_histogram");
    expect(registry.getCounter("my_counter")).toBeDefined();
    expect(registry.getGauge("my_gauge")).toBeDefined();
    expect(registry.getHistogram("my_histogram")).toBeDefined();
    expect(registry.getCounter("unknown")).toBeUndefined();
  });

  it("reset resets all metrics", () => {
    const registry = createMetricsRegistry();
    registry.counter("c").increment(5);
    registry.reset();
    expect(registry.getCounter("c")?.getValue()).toBe(0);
  });
});

// ─── Tracing ────────────────────────────────────────────────────────────

describe("SpanContext", () => {
  it("creates with random IDs", () => {
    const ctx = createSpanContext();
    expect(ctx.traceId.length).toBe(32);
    expect(ctx.spanId.length).toBe(16);
  });

  it("creates child context", () => {
    const parent = createSpanContext({ traceId: "abc" });
    const child = createChildSpanContext(parent);
    expect(child.traceId).toBe("abc");
    expect(child.parentSpanId).toBe(parent.spanId);
  });
});

describe("Span", () => {
  it("creates and ends a span", () => {
    const span = createSpan("test-span");
    expect(span.name).toBe("test-span");
    expect(span.isRecording()).toBe(true);
    span.end();
    expect(span.isRecording()).toBe(false);
    expect(span.getDuration()).toBeGreaterThanOrEqual(0);
  });

  it("sets attributes", () => {
    const span = createSpan("test");
    span.setAttribute("http.method", "GET");
    span.setAttribute("http.status", 200);
    const readable = span.toReadableSpan();
    expect(readable.attributes["http.method"]).toBe("GET");
  });

  it("adds events", () => {
    const span = createSpan("test");
    span.addEvent("cache.miss", { key: "user:1" });
    const readable = span.toReadableSpan();
    expect(readable.events).toHaveLength(1);
    expect(readable.events[0]?.name).toBe("cache.miss");
  });

  it("records errors", () => {
    const span = createSpan("test");
    const error = new Error("boom");
    span.recordError(error);
    expect(span.toReadableSpan().status).toBe(SpanStatus.ERROR);
    expect(
      span.toReadableSpan().events.some((e) => e.name === "exception"),
    ).toBe(true);
  });

  it("sets status", () => {
    const span = createSpan("test");
    span.setStatus(SpanStatus.OK);
    expect(span.toReadableSpan().status).toBe(SpanStatus.OK);
  });

  it("ignores operations after end", () => {
    const span = createSpan("test");
    span.end();
    span.setAttribute("key", "value"); // should not throw
    expect(span.isRecording()).toBe(false);
  });

  it("creates with parent context", () => {
    const parent = createSpanContext({ traceId: "abc" });
    const span = createSpan("child", { parent });
    expect(span.context.traceId).toBe("abc");
    expect(span.context.parentSpanId).toBe(parent.spanId);
  });

  it("records kind", () => {
    const span = createSpan("test", { kind: SpanKind.SERVER });
    expect(span.toReadableSpan().kind).toBe(SpanKind.SERVER);
  });
});

describe("Tracer", () => {
  it("creates a tracer and starts spans", () => {
    const tracer = createTracer();
    const span = tracer.startSpan("test");
    expect(span.name).toBe("test");
    span.end();
  });

  it("notifies processors on start and end", () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const processor = { onStart, onEnd, shutdown: async () => {} };
    const tracer = createTracer({ processors: [processor] });

    const span = tracer.startSpan("test");
    expect(onStart).toHaveBeenCalled();
    span.end();
    expect(onEnd).toHaveBeenCalled();
  });
});

// ─── Sampling ───────────────────────────────────────────────────────────

describe("Sampling", () => {
  it("AlwaysOnSampler always records", () => {
    const sampler = new AlwaysOnSampler();
    expect(sampler.shouldSample().decision).toBe("RECORD_AND_SAMPLE");
  });

  it("AlwaysOffSampler never records", () => {
    const sampler = new AlwaysOffSampler();
    expect(sampler.shouldSample().decision).toBe("DO_NOT_RECORD");
  });

  it("ProbabilitySampler samples based on traceId", () => {
    const sampler = new ProbabilitySampler(1);
    expect(sampler.shouldSample(undefined, "abc123").decision).toBe(
      "RECORD_AND_SAMPLE",
    );

    const offSampler = new ProbabilitySampler(0);
    expect(offSampler.shouldSample(undefined, "abc123").decision).toBe(
      "DO_NOT_RECORD",
    );
  });

  it("ParentBasedSampler delegates to root for root spans", () => {
    const sampler = new ParentBasedSampler(new AlwaysOnSampler());
    expect(sampler.shouldSample().decision).toBe("RECORD_AND_SAMPLE");
  });

  it("ParentBasedSampler follows parent decision", () => {
    const sampler = new ParentBasedSampler();
    const sampled = sampler.shouldSample({
      traceId: "t",
      spanId: "s",
      traceFlags: 1,
    });
    expect(sampled.decision).toBe("RECORD_AND_SAMPLE");

    const notSampled = sampler.shouldSample({
      traceId: "t",
      spanId: "s",
      traceFlags: 0,
    });
    expect(notSampled.decision).toBe("DO_NOT_RECORD");
  });
});

// ─── Console Exporters ──────────────────────────────────────────────────

describe("Console Exporters", () => {
  it("ConsoleSpanExporter exports spans", async () => {
    const exporter = new ConsoleSpanExporter();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await exporter.export([
      {
        name: "test",
        context: { traceId: "t", spanId: "s" },
        kind: SpanKind.INTERNAL,
        startTime: new Date(),
        endTime: new Date(),
        duration: 10,
        status: SpanStatus.OK,
        attributes: {},
        events: [],
        resource: {},
        droppedAttributes: 0,
        droppedEvents: 0,
      },
    ]);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("ConsoleLogExporter exports logs", async () => {
    const exporter = new ConsoleLogExporter();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await exporter.export([
      {
        level: LogLevel.INFO,
        levelName: "info",
        message: "test",
        timestamp: new Date(),
        loggerName: "test",
      },
    ]);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("ConsoleMetricExporter exports metrics", async () => {
    const exporter = new ConsoleMetricExporter();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await exporter.export([
      {
        name: "test",
        type: "counter",
        value: 42,
        timestamp: new Date(),
      },
    ]);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

// ─── Batch Processor ────────────────────────────────────────────────────

describe("BatchSpanProcessor", () => {
  it("flushes on batch size", async () => {
    const exportFn = vi.fn().mockResolvedValue(undefined);
    const exporter = { export: exportFn, shutdown: async () => {} };
    const processor = createBatchSpanProcessor({ exporter, batchSize: 2 });

    const span1 = createSpan("s1");
    const span2 = createSpan("s2");
    processor.onEnd(span1.toReadableSpan());
    processor.onEnd(span2.toReadableSpan());

    await processor.flush();
    expect(exportFn).toHaveBeenCalled();
  });

  it("flushes on shutdown", async () => {
    const exportFn = vi.fn().mockResolvedValue(undefined);
    const exporter = { export: exportFn, shutdown: async () => {} };
    const processor = createBatchSpanProcessor({ exporter });

    const span = createSpan("s1");
    processor.onEnd(span.toReadableSpan());

    await processor.shutdown();
    expect(exportFn).toHaveBeenCalled();
  });

  it("handles export errors gracefully", async () => {
    const exporter = {
      export: async () => {
        throw new Error("fail");
      },
      shutdown: async () => {},
    };
    const processor = createBatchSpanProcessor({ exporter });
    const span = createSpan("s1");
    processor.onEnd(span.toReadableSpan());
    await expect(processor.flush()).resolves.not.toThrow();
  });
});

// ─── Redaction ──────────────────────────────────────────────────────────

describe("Redaction", () => {
  it("redacts default sensitive fields", () => {
    const redactor = createRedactor();
    expect(redactor("password", "secret123")).toBe("[REDACTED]");
    expect(redactor("token", "abc")).toBe("[REDACTED]");
    expect(redactor("authorization", "Bearer x")).toBe("[REDACTED]");
  });

  it("does not redact non-sensitive fields", () => {
    const redactor = createRedactor();
    expect(redactor("username", "alice")).toBe("alice");
    expect(redactor("port", 3000)).toBe(3000);
  });

  it("redacts with custom config", () => {
    const redactor = createRedactor({
      fields: ["custom_field"],
      replacement: "***",
    });
    expect(redactor("custom_field", "value")).toBe("***");
    expect(redactor("password", "value")).toBe("value");
  });

  it("redactObject redacts nested objects", () => {
    const obj = { user: "alice", password: "secret", nested: { token: "abc" } };
    const redacted = redactObject(obj);
    expect(redacted.user).toBe("alice");
    expect(redacted.password).toBe("[REDACTED]");
  });

  it("isSensitiveField checks field names", () => {
    expect(isSensitiveField("password")).toBe(true);
    expect(isSensitiveField("TOKEN")).toBe(true);
    expect(isSensitiveField("username")).toBe(false);
  });
});

// ─── Noop ───────────────────────────────────────────────────────────────

describe("NoopObservability", () => {
  it("creates a noop instance", () => {
    const obs = createNoopObservability();
    expect(obs).toBeInstanceOf(NoopObservability);
  });

  it("logger discards all messages", () => {
    const obs = createNoopObservability();
    obs.logger.info("test");
    obs.logger.error("test");
    expect(obs.logger.isLevelEnabled(LogLevel.INFO)).toBe(false);
  });

  it("metrics return zero/empty values", () => {
    const obs = createNoopObservability();
    obs.metrics.counter("c").increment(5);
    expect(obs.metrics.counter("c").getValue()).toBe(0);
    expect(obs.metrics.getAll()).toEqual([]);
  });

  it("tracer creates noop spans", () => {
    const obs = createNoopObservability();
    const span = obs.tracer.startSpan("test");
    expect(span.isRecording()).toBe(false);
    span.end();
  });

  it("resource returns self", () => {
    const obs = createNoopObservability();
    const child = obs.resource({ key: "value" });
    expect(child).toBe(obs);
  });

  it("shutdown resolves", async () => {
    const obs = createNoopObservability();
    await expect(obs.shutdown()).resolves.not.toThrow();
  });
});

// ─── Observability Facade ───────────────────────────────────────────────

describe("Observability", () => {
  it("creates a full observability instance", () => {
    const obs = createObservability({ serviceName: "test-api" });
    expect(obs.logger.name).toBe("test-api");
    expect(obs.metrics).toBeDefined();
    expect(obs.tracer).toBeDefined();
    expect(obs.propagation).toBeDefined();
  });

  it("logger works end-to-end", () => {
    const obs = createObservability({
      serviceName: "test",
      logLevel: LogLevel.DEBUG,
    });
    expect(() => obs.logger.info("hello")).not.toThrow();
    expect(() => obs.logger.error("oops")).not.toThrow();
  });

  it("metrics work end-to-end", () => {
    const obs = createObservability({ serviceName: "test" });
    obs.metrics.counter("requests").increment(10);
    obs.metrics.gauge("connections").setValue(5);
    obs.metrics.histogram("latency").record(42);
    expect(obs.metrics.counter("requests").getValue()).toBe(10);
    expect(obs.metrics.gauge("connections").getValue()).toBe(5);
    expect(obs.metrics.histogram("latency").getValue().count).toBe(1);
  });

  it("tracing works end-to-end", () => {
    const obs = createObservability({ serviceName: "test" });
    const span = obs.tracer.startSpan("request");
    span.setAttribute("method", "GET");
    span.end();
    expect(span.getDuration()).toBeGreaterThanOrEqual(0);
  });

  it("propagation works end-to-end", async () => {
    const obs = createObservability({ serviceName: "test" });
    const ctx = createPropagationContext({ requestId: "r1" });
    await obs.propagation.run(ctx, () => {
      expect(obs.propagation.current()?.requestId).toBe("r1");
    });
  });

  it("shutdown resolves", async () => {
    const obs = createObservability({ serviceName: "test" });
    await expect(obs.shutdown()).resolves.not.toThrow();
  });
});
