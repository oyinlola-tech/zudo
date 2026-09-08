/**
 * @zudojs/observability — Processor
 *
 * Batch span processor that accumulates spans and exports them periodically.
 * Genuinely memory-bounded: the queue has a hard cap, and spans past it are
 * dropped and counted rather than growing the process until it dies.
 */

import type {
  ReadableSpan,
  Span,
  SpanExporter,
  SpanProcessor,
} from "../types.js";

const DEFAULT_BATCH_SIZE = 512;
const DEFAULT_FLUSH_INTERVAL_MS = 5_000;
const DEFAULT_MAX_QUEUE_SIZE = 2_048;

/** A span exporter that discards everything, for tests and disabled tracing. */
export const noopSpanExporter: SpanExporter = {
  export: async () => {},
  shutdown: async () => {},
};

/** Options for {@link BatchSpanProcessor}. */
export interface BatchSpanProcessorOptions {
  /** Where completed spans go. Required — a processor with no exporter is a leak with extra steps. */
  readonly exporter: SpanExporter;
  /** Spans per export call. Default: 512. */
  readonly batchSize?: number;
  /** How often the queue is drained, in ms. Default: 5,000. */
  readonly flushIntervalMs?: number;
  /** Hard cap on queued spans. Default: 2,048. */
  readonly maxQueueSize?: number;
  /** Reports export failures and dropped spans. */
  readonly onError?: (error: unknown, source: string) => void;
  /** Called when spans are dropped because the queue was full. */
  readonly onDrop?: (droppedCount: number) => void;
}

/**
 * Collects completed spans and exports them in batches.
 * Flushes on batch size or interval, whichever comes first.
 */
export class BatchSpanProcessor implements SpanProcessor {
  private readonly exporter: SpanExporter;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxQueueSize: number;
  private readonly onError?: (error: unknown, source: string) => void;
  private readonly onDrop?: (droppedCount: number) => void;

  private buffer: ReadableSpan[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private shuttingDown = false;
  private inFlight?: Promise<void>;
  private droppedSpans = 0;

  constructor(options: BatchSpanProcessorOptions) {
    this.exporter = options.exporter;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.maxQueueSize = Math.max(
      options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE,
      this.batchSize,
    );
    this.onError = options.onError;
    this.onDrop = options.onDrop;
  }

  onStart(_span: Span): void {
    // No-op: we only care about completed spans.
  }

  onEnd(span: ReadableSpan): void {
    if (this.shuttingDown) return;

    if (this.buffer.length >= this.maxQueueSize) {
      this.droppedSpans++;
      this.onDrop?.(this.droppedSpans);
      return;
    }

    this.buffer.push(span);

    if (this.buffer.length >= this.batchSize) {
      void this.flush();
      return;
    }

    this.startTimer();
  }

  private startTimer(): void {
    if (this.timer !== undefined || this.shuttingDown) return;

    this.timer = setInterval(() => {
      if (this.buffer.length === 0) {
        // Nothing left to drain: stop waking the event loop until the next
        // span arrives, rather than ticking forever for the process lifetime.
        this.stopTimer();
        return;
      }
      void this.flush();
    }, this.flushIntervalMs);

    // Allow the process to exit even if the timer is active.
    if (typeof this.timer === "object" && "unref" in this.timer) {
      this.timer.unref();
    }
  }

  private stopTimer(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Number of spans dropped because the queue was full. */
  getDroppedCount(): number {
    return this.droppedSpans;
  }

  /** Spans currently queued. */
  getQueueSize(): number {
    return this.buffer.length;
  }

  /**
   * Exports everything queued.
   *
   * Concurrent calls are serialised: two overlapping exports against the same
   * backend is a good way to double-deliver a batch or exhaust a connection
   * pool.
   */
  async flush(): Promise<void> {
    if (this.inFlight) {
      await this.inFlight;
      if (this.buffer.length === 0) return;
    }

    const run = this.drain();
    this.inFlight = run;
    try {
      await run;
    } finally {
      if (this.inFlight === run) this.inFlight = undefined;
    }
  }

  private async drain(): Promise<void> {
    while (this.buffer.length > 0) {
      const batch = this.buffer.splice(0, this.batchSize);
      try {
        await this.exporter.export(batch);
      } catch (error) {
        // Telemetry failure must not bring down the application — but it must
        // not be invisible either.
        this.onError?.(error, "SpanExporter.export");
      }
    }
  }

  /** Drains the queue without shutting the processor down. */
  async forceFlush(): Promise<void> {
    await this.flush();
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    this.stopTimer();
    await this.flush();
    await this.exporter.shutdown();
  }
}

/** Creates a batch span processor. */
export function createBatchSpanProcessor(
  options: BatchSpanProcessorOptions,
): BatchSpanProcessor {
  return new BatchSpanProcessor(options);
}

/**
 * A processor that exports each span as it ends.
 *
 * Simple and immediate; use it in tests and short-lived processes, and the
 * batch processor everywhere else.
 */
export class SimpleSpanProcessor implements SpanProcessor {
  private readonly exporter: SpanExporter;
  private readonly onError?: (error: unknown, source: string) => void;
  private pending = new Set<Promise<void>>();

  constructor(options: {
    readonly exporter: SpanExporter;
    readonly onError?: (error: unknown, source: string) => void;
  }) {
    this.exporter = options.exporter;
    this.onError = options.onError;
  }

  onStart(_span: Span): void {}

  onEnd(span: ReadableSpan): void {
    const task = this.exporter
      .export([span])
      .catch((error: unknown) => {
        this.onError?.(error, "SpanExporter.export");
      })
      .finally(() => {
        this.pending.delete(task);
      });
    this.pending.add(task);
  }

  async forceFlush(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }

  async shutdown(): Promise<void> {
    await this.forceFlush();
    await this.exporter.shutdown();
  }
}

/** Creates a simple, unbatched span processor. */
export function createSimpleSpanProcessor(options: {
  readonly exporter: SpanExporter;
  readonly onError?: (error: unknown, source: string) => void;
}): SimpleSpanProcessor {
  return new SimpleSpanProcessor(options);
}
