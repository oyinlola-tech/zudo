/**
 * @zudojs/observability — Console Exporter
 *
 * Exports telemetry to the console for development and debugging.
 *
 * Serialization is defensive, because everything here is fed values the API
 * declares as `unknown`: circular structures, BigInts and throwing getters all
 * reach `JSON.stringify` eventually, and an exporter that throws inside the
 * logging path takes the process with it.
 */

import type {
  LogExporter,
  LogRecord,
  MetricExporter,
  MetricSnapshot,
  ReadableSpan,
  SpanExporter,
} from "../types.js";
import { LogLevel } from "../types.js";

/** Shape of the console methods the exporters use. */
export interface ConsoleLike {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/** Options shared by the console exporters. */
export interface ConsoleExporterOptions {
  /**
   * Indent the JSON. Default: `false` — one line per record is what log
   * shippers parse, and pretty-printing a span is expensive under load.
   */
  readonly pretty?: boolean;
  /** Where to write. Defaults to the global console. */
  readonly console?: ConsoleLike;
}

/**
 * JSON.stringify that cannot throw.
 *
 * Cycles become `"[Circular]"`, BigInts become their decimal string, and a
 * value that defeats serialization entirely falls back to `String(value)`.
 *
 * "Cycle" means an ancestor, not "seen before". A `WeakSet` of every object
 * already visited also matches a value referenced twice from different
 * branches — `{ user, actor: user }` — and silently replaced the second copy
 * with `[Circular]`, losing real telemetry that was never circular. The
 * replacer's `this` is the object currently being serialized, which is what
 * lets the ancestor chain be tracked exactly.
 */
export function safeStringify(value: unknown, pretty = false): string {
  const ancestors: unknown[] = [];
  try {
    return (
      JSON.stringify(
        value,
        function replacer(this: unknown, _key: string, entry: unknown): unknown {
          // Unwind to the holder of the value being visited.
          while (
            ancestors.length > 0 &&
            ancestors[ancestors.length - 1] !== this
          ) {
            ancestors.pop();
          }

          if (typeof entry === "bigint") return entry.toString();
          if (typeof entry === "function") return "[Function]";
          if (typeof entry === "symbol") return entry.toString();
          if (entry instanceof Error) {
            return {
              name: entry.name,
              message: entry.message,
              stack: entry.stack,
            };
          }
          if (typeof entry === "object" && entry !== null) {
            if (ancestors.includes(entry)) return "[Circular]";
            ancestors.push(entry);
          }
          return entry;
        },
        pretty ? 2 : undefined,
      ) ?? String(value)
    );
  } catch {
    return String(value);
  }
}

/**
 * Exports completed spans to the console.
 */
export class ConsoleSpanExporter implements SpanExporter {
  private readonly pretty: boolean;
  private readonly out: ConsoleLike;

  constructor(options?: ConsoleExporterOptions) {
    this.pretty = options?.pretty ?? false;
    this.out = options?.console ?? console;
  }

  async export(spans: readonly ReadableSpan[]): Promise<void> {
    for (const span of spans) {
      this.out.log(
        safeStringify(
          {
            type: "span",
            name: span.name,
            traceId: span.context.traceId,
            spanId: span.context.spanId,
            parentSpanId: span.context.parentSpanId,
            kind: span.kind,
            status: span.status,
            statusMessage: span.statusMessage,
            durationMs: span.duration,
            startTime: span.startTime.toISOString(),
            endTime: span.endTime.toISOString(),
            attributes: span.attributes,
            events: span.events,
            resource: span.resource,
            ...(span.droppedAttributes > 0
              ? { droppedAttributes: span.droppedAttributes }
              : {}),
            ...(span.droppedEvents > 0
              ? { droppedEvents: span.droppedEvents }
              : {}),
          },
          this.pretty,
        ),
      );
    }
  }

  async shutdown(): Promise<void> {
    // No resources to clean up
  }
}

/**
 * Exports log records to the console.
 */
export class ConsoleLogExporter implements LogExporter {
  private readonly pretty: boolean;
  private readonly out: ConsoleLike;

  constructor(options?: ConsoleExporterOptions) {
    this.pretty = options?.pretty ?? false;
    this.out = options?.console ?? console;
  }

  async export(records: readonly LogRecord[]): Promise<void> {
    for (const record of records) {
      const line = safeStringify(
        {
          timestamp: record.timestamp.toISOString(),
          level: record.levelName,
          logger: record.loggerName,
          message: record.message,
          ...(record.traceId ? { traceId: record.traceId } : {}),
          ...(record.spanId ? { spanId: record.spanId } : {}),
          ...(record.context ? { context: record.context } : {}),
          ...(record.error ? { error: record.error } : {}),
        },
        this.pretty,
      );

      if (record.level >= LogLevel.ERROR) this.out.error(line);
      else if (record.level >= LogLevel.WARN) this.out.warn(line);
      else this.out.log(line);
    }
  }

  async shutdown(): Promise<void> {
    // No resources to clean up
  }
}

/**
 * Exports metric snapshots to the console.
 */
export class ConsoleMetricExporter implements MetricExporter {
  private readonly pretty: boolean;
  private readonly out: ConsoleLike;

  constructor(options?: ConsoleExporterOptions) {
    this.pretty = options?.pretty ?? false;
    this.out = options?.console ?? console;
  }

  async export(snapshots: readonly MetricSnapshot[]): Promise<void> {
    for (const snapshot of snapshots) {
      this.out.log(
        safeStringify(
          {
            type: "metric",
            metricType: snapshot.type,
            name: snapshot.name,
            value: snapshot.value,
            labels: snapshot.labels,
            timestamp: snapshot.timestamp.toISOString(),
          },
          this.pretty,
        ),
      );
    }
  }

  async shutdown(): Promise<void> {
    // No resources to clean up
  }
}

/** A log exporter that discards everything. */
export const noopLogExporter: LogExporter = {
  export: async () => {},
  shutdown: async () => {},
};

/** A metric exporter that discards everything. */
export const noopMetricExporter: MetricExporter = {
  export: async () => {},
  shutdown: async () => {},
};

/** Creates a console span exporter. */
export function createConsoleSpanExporter(
  options?: ConsoleExporterOptions,
): ConsoleSpanExporter {
  return new ConsoleSpanExporter(options);
}

/** Creates a console log exporter. */
export function createConsoleLogExporter(
  options?: ConsoleExporterOptions,
): ConsoleLogExporter {
  return new ConsoleLogExporter(options);
}

/** Creates a console metric exporter. */
export function createConsoleMetricExporter(
  options?: ConsoleExporterOptions,
): ConsoleMetricExporter {
  return new ConsoleMetricExporter(options);
}
