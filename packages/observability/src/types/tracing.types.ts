/**
 * Tracing types for the observability package.
 */

/** Status of a span. */
export enum SpanStatus {
  UNSET = "UNSET",
  OK = "OK",
  ERROR = "ERROR",
}

/**
 * W3C trace flags. Bit 0 carries the sampling decision, which is what a
 * downstream service reads to keep a trace whole.
 */
export const TraceFlags = {
  NONE: 0,
  SAMPLED: 1,
} as const;

/** A span event (timestamped annotation). */
export interface SpanEvent {
  readonly name: string;
  readonly timestamp: Date;
  readonly attributes?: Record<string, unknown>;
}

/** Context identifying a specific span within a trace. */
export interface SpanContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  /** @see TraceFlags */
  readonly traceFlags?: number;
}

/** A single unit of work within a distributed trace. */
export interface Span {
  readonly name: string;
  readonly context: SpanContext;
  readonly startTime: Date;

  setAttribute(key: string, value: unknown): void;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  setStatus(status: SpanStatus, message?: string): void;
  recordError(error: Error): void;
  end(): void;
  getDuration(): number;
  isRecording(): boolean;
}

/** Creates new spans. */
export interface Tracer {
  startSpan(name: string, options?: SpanOptions): Span;
}

/** Options for starting a span. */
export interface SpanOptions {
  readonly parent?: SpanContext;
  readonly attributes?: Record<string, unknown>;
  readonly kind?: SpanKind;
}

/** Semantic kind of a span. */
export enum SpanKind {
  INTERNAL = "INTERNAL",
  SERVER = "SERVER",
  CLIENT = "CLIENT",
  PRODUCER = "PRODUCER",
  CONSUMER = "CONSUMER",
}

/** Caps on what a single span may accumulate before export. */
export interface SpanLimits {
  /** Maximum attributes retained. Default: 128. */
  readonly maxAttributes?: number;
  /** Maximum events retained. Default: 128. */
  readonly maxEvents?: number;
  /** Maximum attributes retained per event. Default: 128. */
  readonly maxAttributesPerEvent?: number;
  /** Strings longer than this are truncated. Default: 4096. */
  readonly maxAttributeValueLength?: number;
}

/** Decision on whether a span should be recorded. */
export interface SamplingResult {
  readonly decision: "RECORD_AND_SAMPLE" | "RECORD_ONLY" | "DO_NOT_RECORD";
  readonly attributes?: Record<string, unknown>;
}

/** Determines which traces to sample. */
export interface Sampler {
  shouldSample(parentContext?: SpanContext, traceId?: string): SamplingResult;
}

/** A span that has been completed and is ready for export. */
export interface ReadableSpan {
  readonly name: string;
  readonly context: SpanContext;
  readonly kind: SpanKind;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly duration: number;
  readonly status: SpanStatus;
  /** The message passed alongside the status, when one was given. */
  readonly statusMessage?: string;
  readonly attributes: Record<string, unknown>;
  readonly events: readonly SpanEvent[];
  readonly resource: Record<string, unknown>;
  /** Attributes discarded because the span hit its limit. */
  readonly droppedAttributes: number;
  /** Events discarded because the span hit its limit. */
  readonly droppedEvents: number;
}

/** Exports completed spans to a backend. */
export interface SpanExporter {
  export(spans: readonly ReadableSpan[]): Promise<void>;
  shutdown(): Promise<void>;
}

/** Processes spans before export (batching, filtering, enrichment). */
export interface SpanProcessor {
  onStart(span: Span): void;
  onEnd(span: ReadableSpan): void;
  /** Drains anything buffered without shutting the processor down. */
  forceFlush?(): Promise<void>;
  shutdown(): Promise<void>;
}
