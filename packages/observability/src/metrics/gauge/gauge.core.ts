/**
 * @zudojs/observability — Gauge
 *
 * A value that can go up and down, for tracking current state.
 */

import type { Gauge } from "../../types.js";
import { MetricValueError } from "../../errors/index.js";

/**
 * In-memory gauge. Tracks a value that can be set, incremented, or decremented.
 */
export class DefaultGauge implements Gauge {
  readonly name: string;
  readonly labels?: Record<string, string>;
  private value = 0;

  constructor(name: string, labels?: Record<string, string>) {
    this.name = name;
    this.labels = labels;
  }

  private assertFinite(value: number): void {
    if (!Number.isFinite(value)) {
      throw new MetricValueError(this.name, value, "must be finite");
    }
  }

  setValue(value: number): void {
    this.assertFinite(value);
    this.value = value;
  }

  increment(value = 1): void {
    this.assertFinite(value);
    this.value += value;
  }

  decrement(value = 1): void {
    this.assertFinite(value);
    this.value -= value;
  }

  getValue(): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }
}

/** Creates a gauge. */
export function createGauge(
  name: string,
  labels?: Record<string, string>,
): DefaultGauge {
  return new DefaultGauge(name, labels);
}
