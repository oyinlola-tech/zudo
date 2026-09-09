/**
 * @zudojs/observability — Observability Core
 *
 * Central facade that coordinates logging, metrics, tracing, and context
 * propagation. Other Zudojs packages depend on this abstraction rather
 * than on specific telemetry implementations.
 */

import type {
  Logger,
  MetricExporter,
  SpanExporter,
  MetricsRegistry,
  Observability,
  ObservabilityConfig,
  PropagationManager,
  SpanProcessor,
  Tracer,
} from "../types.js";
import { LogLevel } from "../types.js";
import { StructuredLogger } from "../logger/index.js";
import {
  DefaultMetricsRegistry,
  PeriodicMetricReader,
} from "../metrics/index.js";
import { DefaultTracer } from "../tracing/index.js";
import { AsyncPropagationManager } from "../propagation/index.js";
import {
  ConsoleLogExporter,
  ConsoleSpanExporter,
  ConsoleMetricExporter,
  noopLogExporter,
  noopMetricExporter,
} from "../exporter/index.js";
import {
  BatchLogProcessor,
  BatchSpanProcessor,
  noopSpanExporter,
} from "../processor/index.js";
import { createRedactor, createStructureRedactor } from "../redaction/index.js";
import { AlwaysOnSampler } from "../sampling/index.js";

/**
 * Everything a facade owns and must tear down, shared by an instance and the
 * scopes it creates through {@link DefaultObservability.resource}.
 */
interface TelemetryPipeline {
  readonly logger: StructuredLogger;
  readonly metrics: DefaultMetricsRegistry;
  readonly propagation: AsyncPropagationManager;
  readonly processors: readonly SpanProcessor[];
  readonly logProcessor?: BatchLogProcessor;
  readonly metricReader: PeriodicMetricReader;
  readonly config: ObservabilityConfig;
  readonly sampler: ObservabilityConfig["sampler"];
  /** Redacts span attributes, when `config.redaction` is set. */
  readonly redactAttribute?: (key: string, value: unknown) => unknown;
}

/**
 * Default observability implementation.
 *
 * Provides a unified API for logging, metrics, tracing, and context propagation.
 * Use this as the single entry point for all telemetry in a Zudojs application.
 */
export class DefaultObservability implements Observability {
  readonly logger: Logger;
  readonly metrics: MetricsRegistry;
  readonly tracer: Tracer;
  readonly propagation: PropagationManager;

  private readonly pipeline: TelemetryPipeline;
  private readonly resourceAttributes: Record<string, unknown>;
  /** Scopes share the parent's pipeline, so only the root tears it down. */
  private readonly ownsPipeline: boolean;
  private shutdownPromise?: Promise<void>;

  constructor(
    config: ObservabilityConfig,
    scope?: {
      readonly pipeline: TelemetryPipeline;
      readonly resourceAttributes: Record<string, unknown>;
    },
  ) {
    this.resourceAttributes =
      scope?.resourceAttributes ?? buildResourceAttributes(config);

    if (scope) {
      this.pipeline = scope.pipeline;
      this.ownsPipeline = false;
    } else {
      this.pipeline = buildPipeline(config);
      this.ownsPipeline = true;
    }

    this.logger = this.pipeline.logger;
    this.metrics = this.pipeline.metrics;
    this.propagation = this.pipeline.propagation;

    // The tracer is the one piece that differs per scope, because the
    // resource attributes it stamps onto spans are the scope.
    this.tracer = new DefaultTracer({
      processors: this.pipeline.processors,
      resource: this.resourceAttributes,
      sampler: this.pipeline.sampler ?? new AlwaysOnSampler(),
      limits: this.pipeline.config.spanLimits,
      captureStackTraces: this.pipeline.config.captureStackTraces,
      redactAttribute: this.pipeline.redactAttribute,
      onError: this.pipeline.config.onError,
    });
  }

  /**
   * Creates a scope that differs only in its resource attributes.
   *
   * The logger, registry, processors and exporters are shared with the parent:
   * building a second pipeline here silently dropped every configured
   * exporter and log level, and left an orphan flush timer nobody shut down.
   */
  resource(attributes: Record<string, unknown>): Observability {
    return new DefaultObservability(this.pipeline.config, {
      pipeline: this.pipeline,
      resourceAttributes: { ...this.resourceAttributes, ...attributes },
    });
  }

  /**
   * Drains every buffer without shutting anything down.
   *
   * A scope shares its parent's pipeline, so draining from one is both safe
   * and what the caller asked for. Returning early because the scope does not
   * *own* the pipeline made `obs.resource({...}).flush()` a silent no-op —
   * the buffered records it was meant to push were still sitting in the queue
   * when the caller went on to exit.
   */
  async flush(): Promise<void> {
    await this.drain();
  }

  private async drain(): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    if (this.pipeline.logProcessor) {
      tasks.push(this.pipeline.logProcessor.flush());
    }
    for (const processor of this.pipeline.processors) {
      if (processor.forceFlush) tasks.push(processor.forceFlush());
    }
    tasks.push(this.pipeline.metricReader.collect());
    await this.reportFailures(await Promise.allSettled(tasks), "flush");
  }

  private async reportFailures(
    results: readonly PromiseSettledResult<unknown>[],
    source: string,
  ): Promise<void> {
    for (const result of results) {
      if (result.status === "rejected") {
        this.pipeline.config.onError?.(result.reason, source);
      }
    }
  }

  /**
   * Shuts the pipeline down. Idempotent, and one failing step never skips the
   * rest — a half-torn-down telemetry stack is worse than a noisy one.
   *
   * A scope created by {@link DefaultObservability.resource} does not own the
   * pipeline and shutting it down is a no-op; shut down the root instead.
   */
  async shutdown(): Promise<void> {
    if (!this.ownsPipeline) return;
    this.shutdownPromise ??= this.performShutdown();
    return this.shutdownPromise;
  }

  private async performShutdown(): Promise<void> {
    // Drain first: whatever is still queued should reach the backend before
    // the exporters close.
    await this.drain();

    const steps: Promise<unknown>[] = [];
    steps.push(this.pipeline.metricReader.shutdown());
    if (this.pipeline.logProcessor) {
      steps.push(this.pipeline.logProcessor.shutdown());
    }
    for (const processor of this.pipeline.processors) {
      steps.push(processor.shutdown());
    }
    // Every exporter this facade created is owned by exactly one processor or
    // reader, which closes it in the step above; an exporter supplied by the
    // caller is therefore never closed twice.
    await this.reportFailures(await Promise.allSettled(steps), "shutdown");
  }
}

function buildResourceAttributes(
  config: ObservabilityConfig,
): Record<string, unknown> {
  return {
    "service.name": config.serviceName,
    ...(config.serviceVersion
      ? { "service.version": config.serviceVersion }
      : {}),
    ...(config.environment
      ? { "deployment.environment": config.environment }
      : {}),
    ...(config.resource ?? {}),
  };
}

function buildPipeline(config: ObservabilityConfig): TelemetryPipeline {
  const useConsole = config.useConsoleExporters ?? true;

  /* ── Logging ─────────────────────────────────────────────────────────── */

  const logExporter =
    config.logExporter ??
    (useConsole ? new ConsoleLogExporter() : noopLogExporter);

  const logProcessor = new BatchLogProcessor({
    exporter: logExporter,
    batchSize: config.logBatchSize,
    flushIntervalMs: config.logFlushIntervalMs,
    onError: config.onError,
    onDrop: (dropped) =>
      config.onError?.(
        new Error(`Dropped ${dropped} log records: queue full`),
        "BatchLogProcessor",
      ),
  });

  // Redaction is applied by the logger, so every transport and exporter
  // downstream sees redacted records — configuring it and not wiring it here
  // is what made the "credentials are never logged" promise untrue.
  const redactor = config.redaction
    ? createStructureRedactor(config.redaction)
    : undefined;

  const logger = new StructuredLogger({
    name: config.serviceName,
    level: config.logLevel ?? LogLevel.INFO,
    transport: logProcessor,
    redact: redactor
      ? (context) => redactor(context) as Record<string, unknown>
      : undefined,
  });

  /* ── Tracing ─────────────────────────────────────────────────────────── */

  // Built only when this facade owns the processor: constructing an exporter
  // the caller's own processors will never touch is waste at best and a
  // second, unclosed handle at worst.
  const ownSpanExporter = (): SpanExporter =>
    config.spanExporter ??
    (useConsole ? new ConsoleSpanExporter() : noopSpanExporter);

  const processors: readonly SpanProcessor[] = config.processors ?? [
    new BatchSpanProcessor({
      exporter: ownSpanExporter(),
      onError: config.onError,
      onDrop: (dropped) =>
        config.onError?.(
          new Error(`Dropped ${dropped} spans: queue full`),
          "BatchSpanProcessor",
        ),
    }),
  ];

  // When the caller supplied their own processors, they own the exporter's
  // lifecycle too; otherwise our processor closes it on shutdown.

  /* ── Metrics ─────────────────────────────────────────────────────────── */

  const metrics = new DefaultMetricsRegistry({
    ...(config.metrics ?? {}),
    onCardinalityLimit: (name, size) => {
      config.metrics?.onCardinalityLimit?.(name, size);
      config.onError?.(
        new Error(
          `Metric "${name}" exceeded the registry's series limit (${size}); ` +
            `check for a high-cardinality label`,
        ),
        "MetricsRegistry",
      );
    },
  });

  const metricExporter: MetricExporter | undefined =
    config.metricExporter ??
    (useConsole ? new ConsoleMetricExporter() : undefined);

  // The reader is built whenever there is anything to export to, even at
  // interval 0. `start()` is a no-op at 0, so periodic export stays disabled
  // as documented — but `flush()` and `shutdown()` still collect a final
  // snapshot and close the exporter. Skipping the reader entirely left a
  // console exporter this facade had constructed running to the end of the
  // process with no metric ever leaving it.
  const metricIntervalMs = config.metricExportIntervalMs ?? 60_000;
  const metricReader = new PeriodicMetricReader({
    registry: metrics,
    exporter: metricExporter ?? noopMetricExporter,
    intervalMs: metricIntervalMs,
    onError: config.onError,
  });
  metricReader.start();

  const redactAttribute = config.redaction
    ? buildAttributeRedactor(config.redaction)
    : undefined;

  return {
    logger,
    metrics,
    propagation: new AsyncPropagationManager(),
    processors,
    logProcessor,
    metricReader,
    config,
    sampler: config.sampler,
    redactAttribute,
  };
}

/**
 * Builds the span-attribute redactor.
 *
 * A sensitive key replaces its whole value; anything else is still walked, so
 * a token nested inside an otherwise innocuous `request` attribute is caught
 * too.
 */
function buildAttributeRedactor(
  redaction: NonNullable<ObservabilityConfig["redaction"]>,
): (key: string, value: unknown) => unknown {
  const leaf = createRedactor(redaction);
  const deep = createStructureRedactor(redaction);
  return (key, value) => {
    const replaced = leaf(key, value);
    return replaced === value ? deep(value) : replaced;
  };
}

/** Creates an observability instance. */
export function createObservability(
  config: ObservabilityConfig,
): DefaultObservability {
  return new DefaultObservability(config);
}
