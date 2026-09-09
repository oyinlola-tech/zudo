/**
 * @zudojs/observability — Tracer
 *
 * Creates spans, applies the sampling decision, and notifies processors on
 * start and end.
 */

import type {
  ReadableSpan,
  Sampler,
  Span,
  SpanExporter,
  SpanLimits,
  SpanOptions,
  SpanProcessor,
  Tracer,
} from "../../types.js";
import { TraceFlags } from "../../types.js";
import { DefaultSpan } from "../span/span.core.js";
import {
  createChildSpanContext,
  createSpanContext,
} from "../span/spanContext.type.js";
import { AlwaysOnSampler } from "../../sampling/index.js";

/** Options for {@link DefaultTracer}. */
export interface TracerOptions {
  readonly processors?: readonly SpanProcessor[];
  /**
   * Exporter used by {@link DefaultTracer.exportSpan} for a direct, unbatched
   * export. Spans created through {@link DefaultTracer.startSpan} reach their
   * backend through the processors, not through this.
   */
  readonly exporter?: SpanExporter;
  readonly resource?: Record<string, unknown>;
  /** Decides which traces are recorded. Default: always on. */
  readonly sampler?: Sampler;
  /** Caps on what a single span may accumulate. */
  readonly limits?: SpanLimits;
  /** Record `exception.stacktrace` on `recordError`. Default: `true`. */
  readonly captureStackTraces?: boolean;
  /**
   * Redacts every span attribute and event attribute before it is recorded.
   * Supply one whenever spans can carry request data.
   */
  readonly redactAttribute?: (key: string, value: unknown) => unknown;
  /** Reports a processor failure that would otherwise be swallowed. */
  readonly onError?: (error: unknown, source: string) => void;
}

/**
 * Default tracer that creates spans and notifies processors on start/end.
 */
export class DefaultTracer implements Tracer {
  private readonly processors: SpanProcessor[];
  private readonly exporter?: SpanExporter;
  private readonly resource: Record<string, unknown>;
  private readonly sampler: Sampler;
  private readonly limits?: SpanLimits;
  private readonly captureStackTraces: boolean;
  private readonly redactAttribute?: (key: string, value: unknown) => unknown;
  private readonly onError?: (error: unknown, source: string) => void;

  constructor(options?: TracerOptions) {
    this.processors = [...(options?.processors ?? [])];
    this.exporter = options?.exporter;
    this.resource = { ...(options?.resource ?? {}) };
    this.sampler = options?.sampler ?? new AlwaysOnSampler();
    this.limits = options?.limits;
    this.captureStackTraces = options?.captureStackTraces ?? true;
    this.redactAttribute = options?.redactAttribute;
    this.onError = options?.onError;
  }

  startSpan(name: string, options?: SpanOptions): Span {
    // Build the context first so the sampler can key on the real trace ID,
    // then stamp the decision into traceFlags so children inherit it.
    const base = options?.parent
      ? createChildSpanContext(options.parent)
      : createSpanContext();

    const decision = this.sampler.shouldSample(options?.parent, base.traceId);
    const sampled = decision.decision === "RECORD_AND_SAMPLE";
    const recording = decision.decision !== "DO_NOT_RECORD";

    const context = {
      ...base,
      traceFlags: sampled ? TraceFlags.SAMPLED : TraceFlags.NONE,
    };

    const span = new DefaultSpan(name, context, {
      ...options,
      resource: this.resource,
      limits: this.limits,
      captureStackTraces: this.captureStackTraces,
      redactAttribute: this.redactAttribute,
      recording,
      // Only a sampled span reaches the processors; a RECORD_ONLY span is
      // readable in-process but is not exported.
      onEnd: sampled ? (readable) => this.notifyEnd(readable) : undefined,
    });

    if (decision.attributes) {
      for (const [key, value] of Object.entries(decision.attributes)) {
        span.setAttribute(key, value);
      }
    }

    if (sampled) {
      for (const processor of this.processors) {
        try {
          processor.onStart(span);
        } catch (error) {
          this.onError?.(error, "SpanProcessor.onStart");
        }
      }
    }

    return span;
  }

  private notifyEnd(readable: ReadableSpan): void {
    for (const processor of this.processors) {
      try {
        processor.onEnd(readable);
      } catch (error) {
        this.onError?.(error, "SpanProcessor.onEnd");
      }
    }
  }

  /** Exports a completed span directly, bypassing the processors. */
  async exportSpan(span: ReadableSpan): Promise<void> {
    if (this.exporter) {
      await this.exporter.export([span]);
    }
  }

  /** Drains every processor without shutting anything down. */
  async forceFlush(): Promise<void> {
    const results = await Promise.allSettled(
      this.processors.map((processor) => processor.forceFlush?.()),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        this.onError?.(result.reason, "SpanProcessor.forceFlush");
      }
    }
  }

  /**
   * Shuts down every processor.
   *
   * The exporter is not shut down here: the owner that supplied it shuts it
   * down, and doing it in both places closed the same connection twice.
   */
  async shutdown(): Promise<void> {
    const results = await Promise.allSettled(
      this.processors.map((processor) => processor.shutdown()),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        this.onError?.(result.reason, "SpanProcessor.shutdown");
      }
    }
  }
}

/** Creates a tracer. */
export function createTracer(options?: TracerOptions): DefaultTracer {
  return new DefaultTracer(options);
}
