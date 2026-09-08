/**
 * @zudojs/observability — Metrics Registry
 *
 * Central registry for all metrics. Creates and caches metrics by name+labels.
 */

import type {
  Counter,
  Gauge,
  Histogram,
  MetricsRegistry,
  MetricSnapshot,
} from "../types.js";
import { DefaultCounter } from "./counter/counter.core.js";
import { DefaultGauge } from "./gauge/gauge.core.js";
import { DefaultHistogram } from "./histogram/histogram.core.js";
import { ObservabilityConfigError } from "../errors/index.js";

type MetricType = "counter" | "gauge" | "histogram";

type MetricEntry =
  | { type: "counter"; metric: DefaultCounter }
  | { type: "gauge"; metric: DefaultGauge }
  | { type: "histogram"; metric: DefaultHistogram };

/**
 * Builds the cache key for one series.
 *
 * Label keys and values are JSON-encoded, so `{ a: "b,c=d" }` and
 * `{ a: "b", c: "d" }` cannot collapse onto the same key the way a bare
 * `k=v` join lets them.
 */
export function metricKey(
  type: string,
  name: string,
  labels?: Record<string, string>,
): string {
  const entries = labels
    ? Object.entries(labels)
        .filter(([, value]) => value !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    : [];
  return `${type}:${name}:${JSON.stringify(entries)}`;
}

/** Options for {@link DefaultMetricsRegistry}. */
export interface MetricsRegistryOptions {
  /**
   * Maximum number of distinct series held at once. Default: 10,000.
   *
   * A label carrying a user ID or a path with IDs in it turns an unbounded
   * registry into a memory leak, so the cap is on by default and creating a
   * series past it reports the offending metric instead of growing silently.
   */
  readonly maxSeries?: number;
  /** Bucket boundaries for histograms created by this registry. */
  readonly histogramBoundaries?: readonly number[];
  /** Called when the series cap is hit, once per rejected series. */
  readonly onCardinalityLimit?: (name: string, size: number) => void;
}

const DEFAULT_MAX_SERIES = 10_000;

/**
 * In-memory metrics registry. Creates, caches, and manages metrics.
 */
export class DefaultMetricsRegistry implements MetricsRegistry {
  private readonly metrics = new Map<string, MetricEntry>();
  private readonly maxSeries: number;
  private readonly histogramBoundaries?: readonly number[];
  private readonly onCardinalityLimit?: (name: string, size: number) => void;
  /** Series rejected by the cap, reused so callers still get a usable object. */
  private readonly overflow = new Map<string, MetricEntry>();

  constructor(options?: MetricsRegistryOptions) {
    this.maxSeries = options?.maxSeries ?? DEFAULT_MAX_SERIES;
    this.histogramBoundaries = options?.histogramBoundaries;
    this.onCardinalityLimit = options?.onCardinalityLimit;
  }

  private create(
    type: MetricType,
    name: string,
    labels?: Record<string, string>,
  ): MetricEntry {
    if (type === "counter") {
      return { type, metric: new DefaultCounter(name, labels) };
    }
    if (type === "gauge") {
      return { type, metric: new DefaultGauge(name, labels) };
    }
    return {
      type,
      metric: new DefaultHistogram(name, labels, this.histogramBoundaries),
    };
  }

  private obtain(
    type: MetricType,
    name: string,
    labels?: Record<string, string>,
  ): MetricEntry {
    const key = metricKey(type, name, labels);
    const existing = this.metrics.get(key);
    if (existing) return existing;

    if (this.metrics.size >= this.maxSeries) {
      // Past the cap, hand back a detached series so instrumented code keeps
      // working, but never let the registry itself grow.
      const cached = this.overflow.get(key);
      if (cached) return cached;
      this.onCardinalityLimit?.(name, this.metrics.size);
      const detached = this.create(type, name, labels);
      if (this.overflow.size < this.maxSeries) this.overflow.set(key, detached);
      return detached;
    }

    const entry = this.create(type, name, labels);
    this.metrics.set(key, entry);
    return entry;
  }

  counter(name: string, labels?: Record<string, string>): Counter {
    const entry = this.obtain("counter", name, labels);
    if (entry.type !== "counter") {
      throw new ObservabilityConfigError(
        `Metric "${name}" is already registered as a ${entry.type}`,
        { name, registeredAs: entry.type, requestedAs: "counter" },
      );
    }
    return entry.metric;
  }

  gauge(name: string, labels?: Record<string, string>): Gauge {
    const entry = this.obtain("gauge", name, labels);
    if (entry.type !== "gauge") {
      throw new ObservabilityConfigError(
        `Metric "${name}" is already registered as a ${entry.type}`,
        { name, registeredAs: entry.type, requestedAs: "gauge" },
      );
    }
    return entry.metric;
  }

  histogram(name: string, labels?: Record<string, string>): Histogram {
    const entry = this.obtain("histogram", name, labels);
    if (entry.type !== "histogram") {
      throw new ObservabilityConfigError(
        `Metric "${name}" is already registered as a ${entry.type}`,
        { name, registeredAs: entry.type, requestedAs: "histogram" },
      );
    }
    return entry.metric;
  }

  private lookup(
    type: MetricType,
    name: string,
    labels?: Record<string, string>,
  ): MetricEntry | undefined {
    return this.metrics.get(metricKey(type, name, labels));
  }

  getCounter(
    name: string,
    labels?: Record<string, string>,
  ): Counter | undefined {
    const entry = this.lookup("counter", name, labels);
    return entry?.type === "counter" ? entry.metric : undefined;
  }

  getGauge(name: string, labels?: Record<string, string>): Gauge | undefined {
    const entry = this.lookup("gauge", name, labels);
    return entry?.type === "gauge" ? entry.metric : undefined;
  }

  getHistogram(
    name: string,
    labels?: Record<string, string>,
  ): Histogram | undefined {
    const entry = this.lookup("histogram", name, labels);
    return entry?.type === "histogram" ? entry.metric : undefined;
  }

  getSeries(name: string): readonly MetricSnapshot[] {
    const timestamp = new Date();
    const snapshots: MetricSnapshot[] = [];
    for (const entry of this.metrics.values()) {
      if (entry.metric.name === name) {
        snapshots.push(this.snapshot(entry, timestamp));
      }
    }
    return snapshots;
  }

  private snapshot(entry: MetricEntry, timestamp: Date): MetricSnapshot {
    return {
      name: entry.metric.name,
      type: entry.type,
      value: entry.metric.getValue(),
      labels: entry.metric.labels ? { ...entry.metric.labels } : undefined,
      timestamp,
    };
  }

  getAll(): MetricSnapshot[] {
    const timestamp = new Date();
    return [...this.metrics.values()].map((entry) =>
      this.snapshot(entry, timestamp),
    );
  }

  size(): number {
    return this.metrics.size;
  }

  reset(): void {
    for (const entry of this.metrics.values()) {
      entry.metric.reset();
    }
  }

  clear(): void {
    this.metrics.clear();
    this.overflow.clear();
  }
}

/** Creates a metrics registry. */
export function createMetricsRegistry(
  options?: MetricsRegistryOptions,
): DefaultMetricsRegistry {
  return new DefaultMetricsRegistry(options);
}
