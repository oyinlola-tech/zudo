/**
 * Metrics types for the observability package.
 */

/** A monotonically increasing counter. */
export interface Counter {
  readonly name: string;
  readonly labels?: Record<string, string>;
  /**
   * Adds to the counter. Rejects negative, NaN and infinite values by
   * throwing — a counter that silently ignored them would report a number
   * nobody can reconcile with the code that produced it.
   */
  increment(value?: number): void;
  getValue(): number;
  reset(): void;
}

/** A value that can go up and down. */
export interface Gauge {
  readonly name: string;
  readonly labels?: Record<string, string>;
  setValue(value: number): void;
  increment(value?: number): void;
  decrement(value?: number): void;
  getValue(): number;
  reset(): void;
}

/** The distribution a histogram has observed. */
export interface HistogramValue {
  readonly count: number;
  readonly sum: number;
  readonly min: number;
  readonly max: number;
  /** Mean of the observed values, or 0 when nothing has been recorded. */
  readonly mean: number;
  /** Cumulative bucket counts: every value `<= le` observed so far. */
  readonly buckets: readonly { readonly le: number; readonly count: number }[];
  /** Median, interpolated from the bucket boundaries. */
  readonly p50: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
}

/** A distribution of observed values (latencies, sizes, etc.). */
export interface Histogram {
  readonly name: string;
  readonly labels?: Record<string, string>;
  /** Records one observation. Rejects NaN and infinite values by throwing. */
  record(value: number): void;
  getValue(): HistogramValue;
  /** Estimates a quantile from the bucket boundaries. `q` is in [0, 1]. */
  percentile(q: number): number;
  reset(): void;
}

/** Registry for all metrics. */
export interface MetricsRegistry {
  counter(name: string, labels?: Record<string, string>): Counter;
  gauge(name: string, labels?: Record<string, string>): Gauge;
  histogram(name: string, labels?: Record<string, string>): Histogram;

  /**
   * Looks up one series. Omitting `labels` matches the unlabelled series;
   * it does not mean "any labels", because returning an arbitrary one of
   * several series is never what a caller wants.
   */
  getCounter(
    name: string,
    labels?: Record<string, string>,
  ): Counter | undefined;
  getGauge(name: string, labels?: Record<string, string>): Gauge | undefined;
  getHistogram(
    name: string,
    labels?: Record<string, string>,
  ): Histogram | undefined;

  /** Every series registered under `name`, across all label sets. */
  getSeries(name: string): readonly MetricSnapshot[];

  getAll(): MetricSnapshot[];
  /** Number of series currently held. */
  size(): number;
  reset(): void;
  /** Drops every series. Unlike {@link MetricsRegistry.reset}, forgets them. */
  clear(): void;
}

/** A point-in-time snapshot of a metric. */
export interface MetricSnapshot {
  readonly name: string;
  readonly type: "counter" | "gauge" | "histogram";
  readonly value: number | HistogramValue;
  readonly labels?: Record<string, string>;
  /** When the snapshot was taken. */
  readonly timestamp: Date;
}

/** Exports metric snapshots to a backend. */
export interface MetricExporter {
  export(snapshots: readonly MetricSnapshot[]): Promise<void>;
  shutdown(): Promise<void>;
}
