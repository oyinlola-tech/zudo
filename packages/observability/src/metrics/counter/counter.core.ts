/**
 * @zudojs/observability — Counter
 *
 * Monotonically increasing counter for tracking event counts.
 */

import type { Counter } from "../../types.js";
import { MetricValueError } from "../../errors/index.js";

/**
 * In-memory counter. Increments monotonically.
 *
 * Invalid increments throw rather than being dropped: a counter that quietly
 * ignored a negative delta would report a total nobody can reconcile with the
 * code that produced it.
 */
export class DefaultCounter implements Counter {
  readonly name: string;
  readonly labels?: Record<string, string>;
  private value = 0;

  constructor(name: string, labels?: Record<string, string>) {
    this.name = name;
    this.labels = labels;
  }

  increment(value = 1): void {
    if (!Number.isFinite(value)) {
      throw new MetricValueError(this.name, value, "must be finite");
    }
    if (value < 0) {
      throw new MetricValueError(
        this.name,
        value,
        "a counter cannot decrease; use a gauge",
      );
    }
    this.value += value;
  }

  getValue(): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }
}

/** Creates a counter. */
export function createCounter(
  name: string,
  labels?: Record<string, string>,
): DefaultCounter {
  return new DefaultCounter(name, labels);
}
