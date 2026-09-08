/**
 * @zudojs/observability — Histogram
 *
 * Distribution of observed values for tracking latencies, sizes, etc.
 *
 * Memory is bounded by fixed bucket boundaries rather than by keeping the
 * observations: count, sum, min and max alone cannot answer "what is the p95",
 * which is the question a latency histogram exists to answer.
 */

import type { Histogram, HistogramValue } from "../../types.js";
import { MetricValueError } from "../../errors/index.js";

/**
 * Default boundaries, in milliseconds, covering sub-millisecond calls through
 * ten-second ones. Pass your own when the unit is not latency.
 */
export const DEFAULT_BUCKET_BOUNDARIES: readonly number[] = [
  1, 2, 5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000,
];

/**
 * In-memory histogram with cumulative buckets and interpolated quantiles.
 */
export class DefaultHistogram implements Histogram {
  readonly name: string;
  readonly labels?: Record<string, string>;

  private readonly boundaries: readonly number[];
  /** Counts per bucket; one slot longer than `boundaries` for the overflow. */
  private counts: number[];
  private count = 0;
  private sum = 0;
  private min = Infinity;
  private max = -Infinity;

  constructor(
    name: string,
    labels?: Record<string, string>,
    boundaries: readonly number[] = DEFAULT_BUCKET_BOUNDARIES,
  ) {
    this.name = name;
    this.labels = labels;
    this.boundaries = [...boundaries].sort((a, b) => a - b);
    this.counts = new Array<number>(this.boundaries.length + 1).fill(0);
  }

  record(value: number): void {
    if (!Number.isFinite(value)) {
      throw new MetricValueError(this.name, value, "must be finite");
    }

    this.count++;
    this.sum += value;
    if (value < this.min) this.min = value;
    if (value > this.max) this.max = value;

    let bucket = this.boundaries.length;
    for (let i = 0; i < this.boundaries.length; i++) {
      if (value <= this.boundaries[i]!) {
        bucket = i;
        break;
      }
    }
    this.counts[bucket]! += 1;
  }

  getValue(): HistogramValue {
    const empty = this.count === 0;
    let cumulative = 0;
    const buckets = this.boundaries.map((le, i) => {
      cumulative += this.counts[i]!;
      return { le, count: cumulative };
    });

    return {
      count: this.count,
      sum: this.sum,
      min: empty ? 0 : this.min,
      max: empty ? 0 : this.max,
      mean: empty ? 0 : this.sum / this.count,
      buckets,
      p50: this.percentile(0.5),
      p90: this.percentile(0.9),
      p95: this.percentile(0.95),
      p99: this.percentile(0.99),
    };
  }

  /**
   * Estimates a quantile by linear interpolation inside the bucket the
   * quantile falls in, clamped to the observed min and max.
   */
  percentile(q: number): number {
    if (!Number.isFinite(q) || q < 0 || q > 1) {
      throw new MetricValueError(this.name, q, "quantile must be in [0, 1]");
    }
    if (this.count === 0) return 0;

    const target = q * this.count;
    let cumulative = 0;
    let lowerBound = this.min;

    for (let i = 0; i < this.counts.length; i++) {
      const inBucket = this.counts[i]!;
      if (inBucket === 0) {
        if (i < this.boundaries.length) lowerBound = this.boundaries[i]!;
        continue;
      }

      const upperBound =
        i < this.boundaries.length ? this.boundaries[i]! : this.max;

      if (cumulative + inBucket >= target) {
        const within = (target - cumulative) / inBucket;
        const low = Math.max(lowerBound, this.min);
        const high = Math.min(upperBound, this.max);
        if (high <= low) return high;
        return low + within * (high - low);
      }

      cumulative += inBucket;
      lowerBound = upperBound;
    }

    return this.max;
  }

  reset(): void {
    this.count = 0;
    this.sum = 0;
    this.min = Infinity;
    this.max = -Infinity;
    this.counts = new Array<number>(this.boundaries.length + 1).fill(0);
  }
}

/** Creates a histogram. */
export function createHistogram(
  name: string,
  labels?: Record<string, string>,
  boundaries?: readonly number[],
): DefaultHistogram {
  return new DefaultHistogram(name, labels, boundaries);
}
