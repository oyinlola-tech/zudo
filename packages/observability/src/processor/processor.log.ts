/**
 * @zudojs/observability — Log Processor
 *
 * Buffers log records and hands them to an exporter in batches.
 *
 * A logger writes synchronously and cannot await anything, so the naive
 * bridge — `void exporter.export([record])` — exports one record per line and
 * turns any exporter rejection into an unhandled rejection, which ends the
 * process under Node's default. This transport is that bridge done properly:
 * bounded queue, batched export, errors reported, and a `flush()` that
 * shutdown can await so the last records are not lost.
 */

import type { LogExporter, LogRecord, LogTransport } from "../types.js";

const DEFAULT_BATCH_SIZE = 256;
const DEFAULT_FLUSH_INTERVAL_MS = 1_000;
const DEFAULT_MAX_QUEUE_SIZE = 4_096;

/** Options for {@link BatchLogProcessor}. */
export interface BatchLogProcessorOptions {
  readonly exporter: LogExporter;
  /** Records per export call. Default: 256. */
  readonly batchSize?: number;
  /** How often the queue is drained, in ms. Default: 1,000. */
  readonly flushIntervalMs?: number;
  /** Hard cap on queued records. Default: 4,096. */
  readonly maxQueueSize?: number;
  /** Reports export failures. */
  readonly onError?: (error: unknown, source: string) => void;
  /** Called when records are dropped because the queue was full. */
  readonly onDrop?: (droppedCount: number) => void;
}

/** A {@link LogTransport} that batches records into a {@link LogExporter}. */
export class BatchLogProcessor implements LogTransport {
  readonly name = "batch";

  private readonly exporter: LogExporter;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxQueueSize: number;
  private readonly onError?: (error: unknown, source: string) => void;
  private readonly onDrop?: (droppedCount: number) => void;

  private buffer: LogRecord[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private shuttingDown = false;
  private inFlight?: Promise<void>;
  private droppedRecords = 0;

  constructor(options: BatchLogProcessorOptions) {
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

  write(record: LogRecord): void {
    if (this.shuttingDown) return;

    if (this.buffer.length >= this.maxQueueSize) {
      this.droppedRecords++;
      this.onDrop?.(this.droppedRecords);
      return;
    }

    this.buffer.push(record);

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
        this.stopTimer();
        return;
      }
      void this.flush();
    }, this.flushIntervalMs);

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

  /** Records dropped because the queue was full. */
  getDroppedCount(): number {
    return this.droppedRecords;
  }

  /** Records currently queued. */
  getQueueSize(): number {
    return this.buffer.length;
  }

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
        this.onError?.(error, "LogExporter.export");
      }
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    this.stopTimer();
    await this.flush();
    await this.exporter.shutdown();
  }
}

/** Creates a batching log transport. */
export function createBatchLogProcessor(
  options: BatchLogProcessorOptions,
): BatchLogProcessor {
  return new BatchLogProcessor(options);
}
