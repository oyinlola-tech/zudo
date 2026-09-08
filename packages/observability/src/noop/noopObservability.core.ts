/**
 * @zudojs/observability — Noop Implementations
 *
 * No-op implementations that discard all telemetry.
 * Allows instrumentation code to remain simple without null checks.
 */

import type {
  Counter,
  Gauge,
  Histogram,
  HistogramValue,
  Logger,
  MetricsRegistry,
  Observability,
  PropagationContext,
  PropagationManager,
  Span,
  Tracer,
} from "../types.js";
import { LogLevel, TraceFlags } from "../types.js";
import { createPropagationContext } from "../propagation/index.js";

/* ─── Noop Logger ─────────────────────────────────────────────────────── */

const noopLogger: Logger = {
  name: "noop",
  level: LogLevel.OFF,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => noopLogger,
  isLevelEnabled: () => false,
  setLevel: () => {},
  flush: async () => {},
};

/* ─── Noop Counter ────────────────────────────────────────────────────── */

const noopCounter: Counter = {
  name: "noop",
  increment: () => {},
  getValue: () => 0,
  reset: () => {},
};

/* ─── Noop Gauge ──────────────────────────────────────────────────────── */

const noopGauge: Gauge = {
  name: "noop",
  setValue: () => {},
  increment: () => {},
  decrement: () => {},
  getValue: () => 0,
  reset: () => {},
};

/* ─── Noop Histogram ──────────────────────────────────────────────────── */

const EMPTY_HISTOGRAM: HistogramValue = {
  count: 0,
  sum: 0,
  min: 0,
  max: 0,
  mean: 0,
  buckets: [],
  p50: 0,
  p90: 0,
  p95: 0,
  p99: 0,
};

const noopHistogram: Histogram = {
  name: "noop",
  record: () => {},
  getValue: () => EMPTY_HISTOGRAM,
  percentile: () => 0,
  reset: () => {},
};

/* ─── Noop Metrics Registry ───────────────────────────────────────────── */

const noopMetricsRegistry: MetricsRegistry = {
  counter: () => noopCounter,
  gauge: () => noopGauge,
  histogram: () => noopHistogram,
  getCounter: () => undefined,
  getGauge: () => undefined,
  getHistogram: () => undefined,
  getSeries: () => [],
  getAll: () => [],
  size: () => 0,
  reset: () => {},
  clear: () => {},
};

/* ─── Noop Span ───────────────────────────────────────────────────────── */

/**
 * A span that records nothing.
 *
 * `startTime` is a getter rather than a captured value: as a module-level
 * constant it would report the moment the process loaded, for every span,
 * forever. The context carries the all-zero IDs the W3C spec reserves for
 * "invalid", so a noop span that reaches an exporter is recognisable rather
 * than looking like a real trace.
 */
const noopSpan: Span = {
  name: "noop",
  context: {
    traceId: "0".repeat(32),
    spanId: "0".repeat(16),
    traceFlags: TraceFlags.NONE,
  },
  get startTime(): Date {
    return new Date();
  },
  setAttribute: () => {},
  addEvent: () => {},
  setStatus: () => {},
  recordError: () => {},
  end: () => {},
  getDuration: () => 0,
  isRecording: () => false,
};

/* ─── Noop Tracer ─────────────────────────────────────────────────────── */

const noopTracer: Tracer = {
  startSpan: () => noopSpan,
};

/* ─── Noop Propagation Manager ────────────────────────────────────────── */

const noopPropagationManager: PropagationManager = {
  current: () => undefined,
  run: async (_ctx, fn) => fn(),
  runSync: (_ctx, fn) => fn(),
  derive: (overrides) => createPropagationContext(overrides),
};

/* ─── Noop Observability ──────────────────────────────────────────────── */

/**
 * No-op observability that discards all telemetry.
 * Use when observability is disabled to avoid null checks in instrumented code.
 */
export class NoopObservability implements Observability {
  readonly logger: Logger = noopLogger;
  readonly metrics: MetricsRegistry = noopMetricsRegistry;
  readonly tracer: Tracer = noopTracer;
  readonly propagation: PropagationManager = noopPropagationManager;

  resource(_attributes: Record<string, unknown>): Observability {
    return this;
  }

  async flush(): Promise<void> {}

  async shutdown(): Promise<void> {}
}

/** Creates a noop observability instance. */
export function createNoopObservability(): NoopObservability {
  return new NoopObservability();
}

/** A propagation context with the reserved invalid IDs. */
export const INVALID_PROPAGATION_CONTEXT: PropagationContext = Object.freeze({
  traceId: "0".repeat(32),
  spanId: "0".repeat(16),
  traceFlags: TraceFlags.NONE,
});

export {
  noopLogger,
  noopCounter,
  noopGauge,
  noopHistogram,
  noopMetricsRegistry,
  noopSpan,
  noopTracer,
  noopPropagationManager,
};
