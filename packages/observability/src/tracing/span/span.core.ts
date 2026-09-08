/**
 * @zudojs/observability — Span
 *
 * In-memory span that records attributes, events, status, and errors.
 * Exported as a ReadableSpan when ended.
 */

import type {
  ReadableSpan,
  Span,
  SpanContext,
  SpanEvent,
  SpanLimits,
  SpanOptions,
} from "../../types.js";
import { SpanKind, SpanStatus } from "../../types.js";
import {
  createSpanContext,
  createChildSpanContext,
} from "./spanContext.type.js";

/** Defaults matching the OpenTelemetry specification. */
const DEFAULT_LIMITS: Required<SpanLimits> = {
  maxAttributes: 128,
  maxEvents: 128,
  maxAttributesPerEvent: 128,
  maxAttributeValueLength: 4096,
};

/** Extra construction options a tracer supplies alongside {@link SpanOptions}. */
export interface SpanInternalOptions {
  readonly resource?: Record<string, unknown>;
  readonly limits?: SpanLimits;
  /** Record `exception.stacktrace` on `recordError`. Default: `true`. */
  readonly captureStackTraces?: boolean;
  /** Called once, after `end()`, with the completed span. */
  readonly onEnd?: (span: ReadableSpan) => void;
  /**
   * A non-recording span keeps its context — so children still correlate —
   * but drops attributes and events instead of accumulating them.
   */
  readonly recording?: boolean;
}

/**
 * Default span implementation.
 *
 * Records attributes, events, errors, and timing until end() is called.
 * Attribute and event counts are capped, because an unbounded span is a
 * memory leak that only shows up under the load that produced it.
 */
export class DefaultSpan implements Span {
  readonly name: string;
  readonly context: SpanContext;
  readonly startTime: Date;
  readonly kind: SpanKind;

  private attributes: Record<string, unknown> = {};
  private events: SpanEvent[] = [];
  private status: SpanStatus = SpanStatus.UNSET;
  private statusMessage?: string;
  private endTime?: Date;
  private ended = false;
  private droppedAttributes = 0;
  private droppedEvents = 0;

  private readonly resource: Record<string, unknown>;
  private readonly limits: Required<SpanLimits>;
  private readonly captureStackTraces: boolean;
  private readonly recording: boolean;
  private readonly onEnd?: (span: ReadableSpan) => void;

  /**
   * Monotonic reference for the duration. `Date` is subject to NTP steps and
   * manual clock changes, which produce negative or inflated durations; the
   * wall-clock timestamps stay for display.
   */
  private readonly startedAt: number;
  private endedAt?: number;

  constructor(
    name: string,
    context: SpanContext,
    options?: SpanOptions & SpanInternalOptions,
  ) {
    this.name = name;
    this.context = context;
    this.kind = options?.kind ?? SpanKind.INTERNAL;
    this.startTime = new Date();
    this.startedAt = performance.now();
    this.resource = { ...(options?.resource ?? {}) };
    this.limits = { ...DEFAULT_LIMITS, ...(options?.limits ?? {}) };
    this.captureStackTraces = options?.captureStackTraces ?? true;
    this.recording = options?.recording ?? true;
    this.onEnd = options?.onEnd;

    if (options?.attributes) {
      for (const [key, value] of Object.entries(options.attributes)) {
        this.setAttribute(key, value);
      }
    }
  }

  private truncate(value: unknown): unknown {
    if (
      typeof value === "string" &&
      value.length > this.limits.maxAttributeValueLength
    ) {
      return value.slice(0, this.limits.maxAttributeValueLength);
    }
    return value;
  }

  setAttribute(key: string, value: unknown): void {
    if (this.ended || !this.recording) return;
    if (
      !(key in this.attributes) &&
      Object.keys(this.attributes).length >= this.limits.maxAttributes
    ) {
      this.droppedAttributes++;
      return;
    }
    this.attributes[key] = this.truncate(value);
  }

  addEvent(name: string, attributes?: Record<string, unknown>): void {
    if (this.ended || !this.recording) return;
    if (this.events.length >= this.limits.maxEvents) {
      this.droppedEvents++;
      return;
    }

    let eventAttributes: Record<string, unknown> | undefined;
    if (attributes) {
      eventAttributes = {};
      let kept = 0;
      for (const [key, value] of Object.entries(attributes)) {
        if (kept >= this.limits.maxAttributesPerEvent) {
          this.droppedAttributes++;
          continue;
        }
        eventAttributes[key] = this.truncate(value);
        kept++;
      }
    }

    this.events.push({
      name,
      timestamp: new Date(),
      attributes: eventAttributes,
    });
  }

  setStatus(status: SpanStatus, message?: string): void {
    if (this.ended) return;
    this.status = status;
    this.statusMessage = message;
  }

  recordError(error: Error): void {
    if (this.ended) return;
    this.status = SpanStatus.ERROR;
    this.statusMessage = error.message;
    this.addEvent("exception", {
      "exception.type": error.name,
      "exception.message": error.message,
      ...(this.captureStackTraces
        ? { "exception.stacktrace": error.stack }
        : {}),
    });
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.endTime = new Date();
    this.endedAt = performance.now();
    this.onEnd?.(this.toReadableSpan());
  }

  getDuration(): number {
    const finished = this.endedAt ?? performance.now();
    return finished - this.startedAt;
  }

  isRecording(): boolean {
    return !this.ended && this.recording;
  }

  /** True once {@link DefaultSpan.end} has run. */
  hasEnded(): boolean {
    return this.ended;
  }

  /** The message passed alongside the current status, if any. */
  getStatusMessage(): string | undefined {
    return this.statusMessage;
  }

  /** Exports the span as a ReadableSpan. */
  toReadableSpan(): ReadableSpan {
    return {
      name: this.name,
      context: this.context,
      kind: this.kind,
      startTime: this.startTime,
      endTime: this.endTime ?? new Date(),
      duration: this.getDuration(),
      status: this.status,
      statusMessage: this.statusMessage,
      attributes: { ...this.attributes },
      events: [...this.events],
      resource: { ...this.resource },
      droppedAttributes: this.droppedAttributes,
      droppedEvents: this.droppedEvents,
    };
  }
}

/** Creates a new span. */
export function createSpan(
  name: string,
  options?: SpanOptions & SpanInternalOptions,
): DefaultSpan {
  const context = options?.parent
    ? createChildSpanContext(options.parent)
    : createSpanContext();
  return new DefaultSpan(name, context, options);
}
