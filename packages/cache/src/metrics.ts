/**
 * @zudojs/cache — Metrics
 * Tracks cache operation metrics including hit/miss ratios, latency histograms, and error counts.
 */

import type {
  CacheKey,
  CacheMetrics,
  CacheOperation,
  CacheStats,
} from "./types.js";
import {
  LATENCY_BUCKETS,
  MAX_LATENCY_SAMPLES,
  MAX_TRACKED_KEYS,
} from "./constants.js";

export class InMemoryCacheMetrics implements CacheMetrics {
  private hits = 0;
  private misses = 0;
  private sets = 0;
  private deletes = 0;
  private errors = 0;
  private readonly keyHits = new Map<CacheKey, number>();
  private readonly latencies = new Map<CacheOperation, number[]>();

  incrementHit(key?: CacheKey): void {
    this.hits++;
    if (!key) return;
    const current = this.keyHits.get(key);
    if (current !== undefined) {
      this.keyHits.set(key, current + 1);
      return;
    }
    // Cap the number of distinct tracked keys so hot-key tracking cannot
    // grow without bound; new keys are ignored once the cap is reached.
    if (this.keyHits.size >= MAX_TRACKED_KEYS) return;
    this.keyHits.set(key, 1);
  }
  incrementMiss(_key?: CacheKey): void {
    this.misses++;
  }
  incrementSet(_key?: CacheKey): void {
    this.sets++;
  }
  incrementDelete(_key?: CacheKey): void {
    this.deletes++;
  }
  incrementError(_key?: CacheKey): void {
    this.errors++;
  }

  observeLatency(operation: CacheOperation, latencyMs: number): void {
    if (!this.latencies.has(operation)) this.latencies.set(operation, []);
    const samples = this.latencies.get(operation)!;
    samples.push(latencyMs);
    if (samples.length > MAX_LATENCY_SAMPLES)
      samples.splice(0, samples.length - MAX_LATENCY_SAMPLES);
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      deletes: this.deletes,
      errors: this.errors,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  getLatencyStats(operation: CacheOperation): {
    readonly count: number;
    readonly min: number;
    readonly max: number;
    readonly mean: number;
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
  } {
    const samples = [...(this.latencies.get(operation) ?? [])].sort(
      (a, b) => a - b,
    );
    if (samples.length === 0)
      return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
    const sum = samples.reduce((a, b) => a + b, 0);
    return {
      count: samples.length,
      min: samples[0]!,
      max: samples[samples.length - 1]!,
      mean: sum / samples.length,
      p50: percentile(samples, 50),
      p95: percentile(samples, 95),
      p99: percentile(samples, 99),
    };
  }

  getHotKeys(
    topN = 10,
  ): readonly { readonly key: CacheKey; readonly hits: number }[] {
    return [...this.keyHits.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([key, hits]) => ({ key, hits }));
  }

  getLatencyHistogram(
    operation: CacheOperation,
  ): readonly { readonly bucket: number; readonly count: number }[] {
    const samples = this.latencies.get(operation) ?? [];
    // A +Infinity bucket captures samples above the largest finite boundary.
    const boundaries: readonly number[] = [
      ...LATENCY_BUCKETS,
      Number.POSITIVE_INFINITY,
    ];
    return boundaries.map((boundary) => ({
      bucket: boundary,
      count: samples.filter((s) => s <= boundary).length,
    }));
  }

  reset(): void {
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.deletes = 0;
    this.errors = 0;
    this.keyHits.clear();
    this.latencies.clear();
  }
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

export function createCacheMetrics(): InMemoryCacheMetrics {
  return new InMemoryCacheMetrics();
}
