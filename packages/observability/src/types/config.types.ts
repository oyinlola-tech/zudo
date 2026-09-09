/**
 * Configuration types for the observability package.
 */

import type { LogLevel, Logger, LogExporter } from "./logging.types.js";
import type { MetricsRegistry, MetricExporter } from "./metrics.types.js";
import type { MetricsRegistryOptions } from "../metrics/metrics.registry.js";
import type {
  Tracer,
  SpanExporter,
  SpanProcessor,
  SpanLimits,
  Sampler,
} from "./tracing.types.js";

/** Distributed tracing context carried through execution. */
export interface PropagationContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly userId?: string;
  readonly service?: string;
  /** @see import("./tracing.types.js").TraceFlags */
  readonly traceFlags?: number;
  readonly baggage?: Record<string, string>;
}

/** Options for creating a propagation context. */
export interface PropagationContextOptions {
  readonly traceId?: string;
  readonly spanId?: string;
  readonly parentSpanId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly userId?: string;
  readonly service?: string;
  readonly traceFlags?: number;
  readonly baggage?: Record<string, string>;
}

/** Manages propagation contexts. */
export interface PropagationManager {
  /**
   * The active context, or `undefined` outside a {@link PropagationManager.run}
   * scope. Callers that want a context regardless should create one
   * explicitly, so that "no context" stays distinguishable from a real one.
   */
  current(): PropagationContext | undefined;
  /** Runs a function with a new propagation context. */
  run<T>(context: PropagationContext, fn: () => T | Promise<T>): Promise<T>;
  /** Runs a function synchronously with a new propagation context. */
  runSync<T>(context: PropagationContext, fn: () => T): T;
  /** Creates a new context derived from the current one. */
  derive(overrides?: PropagationContextOptions): PropagationContext;
}

/** How a field name is matched against the sensitive-field list. */
export type RedactionMatchMode = "exact" | "contains";

/** Configuration for redacting sensitive fields from logs and traces. */
export interface RedactionConfig {
  /**
   * Field names to redact (case-insensitive). Defaults to a built-in list
   * covering passwords, tokens, cookies, keys and card numbers.
   */
  readonly fields?: readonly string[];
  /**
   * Additional patterns tested against the field name. Useful for
   * conventions a name list cannot express, such as `/^x-.*-token$/i`.
   */
  readonly patterns?: readonly RegExp[];
  /**
   * `"contains"` (the default) matches on word boundaries: a field is
   * sensitive when any run of its words spells a listed term, so
   * `userPassword`, `x-api-key` and `accessToken` are all caught while
   * `shippingAddress` and `authorId` — which a raw substring test redacts
   * because they contain `pin` and `auth` — are not. `"exact"` matches only
   * whole names.
   */
  readonly matchMode?: RedactionMatchMode;
  /** Custom redaction function, consulted before the field list. */
  readonly customRedactor?: (key: string, value: unknown) => unknown;
  /** Replacement text. Defaults to `"[REDACTED]"`. */
  readonly replacement?: string;
  /** How deep to walk nested structures. Default: 8. */
  readonly maxDepth?: number;
}

/** Central observability facade. */
export interface Observability {
  readonly logger: Logger;
  readonly metrics: MetricsRegistry;
  readonly tracer: Tracer;
  readonly propagation: PropagationManager;

  /** Creates a scoped observability instance with resource attributes. */
  resource(attributes: Record<string, unknown>): Observability;

  /** Drains every buffer without shutting anything down. */
  flush(): Promise<void>;

  /** Shuts down all exporters and processors. Safe to call more than once. */
  shutdown(): Promise<void>;
}

/** Configuration for the observability system. */
export interface ObservabilityConfig {
  readonly serviceName: string;
  readonly serviceVersion?: string;
  readonly environment?: string;
  readonly logLevel?: LogLevel;
  readonly logExporter?: LogExporter;
  readonly spanExporter?: SpanExporter;
  readonly metricExporter?: MetricExporter;
  readonly sampler?: Sampler;
  readonly processors?: readonly SpanProcessor[];
  /**
   * Redacts sensitive fields from log contexts *and* from span attributes and
   * span event attributes. Omit it and neither is redacted.
   */
  readonly redaction?: RedactionConfig;
  /**
   * Metrics registry tuning: the series cap that bounds cardinality, and the
   * histogram bucket boundaries. Without this the defaults were unreachable
   * from the facade, so an application could not lower the 10,000-series cap
   * that is its only protection against a label carrying a user ID.
   */
  readonly metrics?: MetricsRegistryOptions;
  readonly resource?: Record<string, unknown>;
  /** Caps on what a single span may accumulate. */
  readonly spanLimits?: SpanLimits;
  /**
   * Fall back to the console exporters when no exporter is supplied.
   * Defaults to `true`, which prints logs and spans to stdout — convenient in
   * development and rarely wanted in production, so set it to `false` (or
   * pass real exporters) when deploying.
   */
  readonly useConsoleExporters?: boolean;
  /** How often metrics are exported, in ms. Default: 60,000. `0` disables it. */
  readonly metricExportIntervalMs?: number;
  /** How often buffered log records are flushed, in ms. Default: 1,000. */
  readonly logFlushIntervalMs?: number;
  /** How many log records are buffered before an eager flush. Default: 256. */
  readonly logBatchSize?: number;
  /**
   * Record `exception.stacktrace` on spans. Stack traces reach the telemetry
   * backend unredacted, so this is opt-out. Default: `true`.
   */
  readonly captureStackTraces?: boolean;
  /** Reports a telemetry failure that would otherwise be swallowed. */
  readonly onError?: (error: unknown, source: string) => void;
}
