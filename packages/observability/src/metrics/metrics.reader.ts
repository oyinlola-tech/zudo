/**
 * @zudojs/observability — Metric Reader
 *
 * Metrics are pull-based in-process: the registry holds live numbers and
 * nothing moves them anywhere. This reader is the missing half — it snapshots
 * the registry on an interval and hands the snapshots to an exporter, so a
 * configured `metricExporter` actually receives data.
 */

import type { MetricExporter, MetricsRegistry } from "../types.js";

const DEFAULT_INTERVAL_MS = 60_000;

/** Options for {@link PeriodicMetricReader}. */
export interface PeriodicMetricReaderOptions {
  readonly registry: MetricsRegistry;
  readonly exporter: MetricExporter;
  /** Export interval in ms. Default: 60,000. `0` disables the timer. */
  readonly intervalMs?: number;
  /** Reports export failures. */
  readonly onError?: (error: unknown, source: string) => void;
}

/** Snapshots a registry on an interval and exports the result. */
export class PeriodicMetricReader {
  private readonly registry: MetricsRegistry;
  private readonly exporter: MetricExporter;
  private readonly intervalMs: number;
  private readonly onError?: (error: unknown, source: string) => void;

  private timer?: ReturnType<typeof setInterval>;
  private started = false;
  private shuttingDown = false;
  private inFlight?: Promise<void>;

  constructor(options: PeriodicMetricReaderOptions) {
    this.registry = options.registry;
    this.exporter = options.exporter;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.onError = options.onError;
  }

  /** Begins periodic export. Calling it twice is a no-op. */
  start(): void {
    if (this.started || this.shuttingDown || this.intervalMs <= 0) return;
    this.started = true;

    this.timer = setInterval(() => {
      void this.collect();
    }, this.intervalMs);

    if (typeof this.timer === "object" && "unref" in this.timer) {
      this.timer.unref();
    }
  }

  /** Exports one snapshot immediately. */
  async collect(): Promise<void> {
    if (this.inFlight) {
      await this.inFlight;
      return;
    }

    const run = (async () => {
      const snapshots = this.registry.getAll();
      if (snapshots.length === 0) return;
      try {
        await this.exporter.export(snapshots);
      } catch (error) {
        this.onError?.(error, "MetricExporter.export");
      }
    })();

    this.inFlight = run;
    try {
      await run;
    } finally {
      if (this.inFlight === run) this.inFlight = undefined;
    }
  }

  /** Exports a final snapshot and stops. Safe to call more than once. */
  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    await this.collect();
    await this.exporter.shutdown();
  }
}

/** Creates a periodic metric reader. */
export function createPeriodicMetricReader(
  options: PeriodicMetricReaderOptions,
): PeriodicMetricReader {
  return new PeriodicMetricReader(options);
}
