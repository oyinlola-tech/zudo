/**
 * @zudojs/observability
 *
 * Structured logging, metrics, tracing, context propagation, and
 * telemetry exporters for the Zudojs framework.
 *
 * Provides the instrumentation and abstraction layer without coupling
 * to any specific telemetry provider. Exporters for OpenTelemetry,
 * Prometheus, Datadog, etc. can be added as separate packages.
 *
 * ## Usage
 *
 * ```typescript
 * import { createObservability, LogLevel } from "@zudojs/observability";
 *
 * const obs = createObservability({
 *   serviceName: "my-api",
 *   logLevel: LogLevel.INFO,
 *   redaction: {},                 // opt in to redaction
 *   sampler: createProbabilitySampler(0.1),
 * });
 *
 * obs.logger.info("Server started", { port: 3000 });
 * obs.metrics.counter("http.requests.total").increment();
 * const span = obs.tracer.startSpan("handle-request");
 * span.end();
 *
 * await obs.shutdown();
 * ```
 *
 * @packageDocumentation
 */

/* ─── Core Types ────────────────────────────────────────────────────────── */

export {
  LogLevel,
  SpanStatus,
  SpanKind,
  TraceFlags,
  type LogLevelName,
  type LogRecord,
  type LogRecordError,
  type Logger,
  type LoggerOptions,
  type LogTransport,
  type PropagationContext,
  type PropagationContextOptions,
  type PropagationManager,
  type Counter,
  type Gauge,
  type Histogram,
  type HistogramValue,
  type MetricsRegistry,
  type MetricSnapshot,
  type Span,
  type SpanContext,
  type SpanEvent,
  type SpanOptions,
  type SpanLimits,
  type Tracer,
  type ReadableSpan,
  type SpanExporter,
  type LogExporter,
  type MetricExporter,
  type SpanProcessor,
  type SamplingResult,
  type Sampler,
  type RedactionConfig,
  type RedactionMatchMode,
  type Observability,
  type ObservabilityConfig,
} from "./types.js";

/* ─── Errors ────────────────────────────────────────────────────────────── */

export {
  ObservabilityError,
  ExporterError,
  ObservabilityConfigError,
  MetricValueError,
  isObservabilityError,
} from "./errors/index.js";

/* ─── Identifiers ───────────────────────────────────────────────────────── */

export {
  generateTraceId,
  generateSpanId,
  isValidTraceId,
  isValidSpanId,
} from "./internal/index.js";

/* ─── Log Level ─────────────────────────────────────────────────────────── */

export {
  logLevelToName,
  logLevelFromName,
  parseLogLevel,
  shouldLog,
  getLogLevelNames,
} from "./logLevel/index.js";

/* ─── Log Record ────────────────────────────────────────────────────────── */

export {
  createLogRecord,
  createErrorLogRecord,
  serializeError,
} from "./logRecord/index.js";

/* ─── Logger ────────────────────────────────────────────────────────────── */

export { StructuredLogger, createStructuredLogger } from "./logger/index.js";

/* ─── Propagation ───────────────────────────────────────────────────────── */

export {
  createPropagationContext,
  derivePropagationContext,
  getCurrentContext,
  requireCurrentContext,
  AsyncPropagationManager,
  createPropagationManager,
} from "./propagation/index.js";

/* ─── Metrics ───────────────────────────────────────────────────────────── */

export {
  DefaultCounter,
  createCounter,
  DefaultGauge,
  createGauge,
  DefaultHistogram,
  createHistogram,
  DEFAULT_BUCKET_BOUNDARIES,
  DefaultMetricsRegistry,
  createMetricsRegistry,
  metricKey,
  PeriodicMetricReader,
  createPeriodicMetricReader,
  type MetricsRegistryOptions,
  type PeriodicMetricReaderOptions,
} from "./metrics/index.js";

/* ─── Tracing ───────────────────────────────────────────────────────────── */

export {
  DefaultSpan,
  createSpan,
  createSpanContext,
  createChildSpanContext,
  isSampledContext,
  DefaultTracer,
  createTracer,
  type TracerOptions,
} from "./tracing/index.js";

/* ─── Sampling ──────────────────────────────────────────────────────────── */

export {
  AlwaysOnSampler,
  AlwaysOffSampler,
  ProbabilitySampler,
  ParentBasedSampler,
  createAlwaysOnSampler,
  createAlwaysOffSampler,
  createProbabilitySampler,
  createParentBasedSampler,
  isSampled,
  isRecording,
  type ParentBasedSamplerOptions,
} from "./sampling/index.js";

/* ─── Exporters ─────────────────────────────────────────────────────────── */

export {
  ConsoleSpanExporter,
  ConsoleLogExporter,
  ConsoleMetricExporter,
  createConsoleSpanExporter,
  createConsoleLogExporter,
  createConsoleMetricExporter,
  noopLogExporter,
  noopMetricExporter,
  safeStringify,
  type ConsoleExporterOptions,
  type ConsoleLike,
} from "./exporter/index.js";

/* ─── Processors ────────────────────────────────────────────────────────── */

export {
  BatchSpanProcessor,
  createBatchSpanProcessor,
  SimpleSpanProcessor,
  createSimpleSpanProcessor,
  BatchLogProcessor,
  createBatchLogProcessor,
  noopSpanExporter,
  type BatchSpanProcessorOptions,
  type BatchLogProcessorOptions,
} from "./processor/index.js";

/* ─── Redaction ─────────────────────────────────────────────────────────── */

export {
  createRedactor,
  createStructureRedactor,
  redactObject,
  redactValue,
  isSensitiveField,
  DEFAULT_SENSITIVE_FIELDS,
  CIRCULAR_MARKER,
  MAX_DEPTH_MARKER,
} from "./redaction/index.js";

/* ─── Noop ──────────────────────────────────────────────────────────────── */

export {
  NoopObservability,
  createNoopObservability,
  noopLogger,
  noopCounter,
  noopGauge,
  noopHistogram,
  noopMetricsRegistry,
  noopSpan,
  noopTracer,
  noopPropagationManager,
  INVALID_PROPAGATION_CONTEXT,
} from "./noop/index.js";

/* ─── Observability Facade ──────────────────────────────────────────────── */

export {
  DefaultObservability,
  createObservability,
} from "./observability/index.js";
