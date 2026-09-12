import type { LogLevel } from "./logLevel.level.js";
import type { LoggerContext } from "./loggerContext.context.js";
import type { LogContext } from "./logger.js";

/**
 * Represents a single structured log entry.
 *
 * A LogEntry is the framework's internal representation of a log event.
 * Concrete logger implementations decide how this entry is serialized
 * or transported.
 */
export interface LogEntry {
  /**
   * Severity of the log event.
   */
  readonly level: LogLevel;

  /**
   * Human-readable log message.
   */
  readonly message: string;

  /**
   * Time at which the log event was created.
   */
  readonly timestamp: Date;

  /**
   * Structured context attached to the entry.
   *
   * Either well-known framework context fields (LoggerContext)
   * or arbitrary structured metadata supplied by the caller.
   */
  readonly context?: LoggerContext | LogContext;

  /**
   * Error associated with the log event.
   */
  readonly error?: LogError;
}

/**
 * Serializable representation of an error attached to a log entry.
 */
export interface LogError {
  /**
   * Error class or type name.
   */
  readonly name?: string;

  /**
   * Human-readable error message.
   */
  readonly message?: string;

  /**
   * Stack trace when available.
   */
  readonly stack?: string;

  /**
   * Machine-readable error code.
   */
  readonly code?: string;

  /**
   * Additional structured error information.
   */
  readonly details?: unknown;

  /**
   * Original underlying error when represented structurally.
   */
  readonly cause?: unknown;
}

/**
 * Maximum depth to which nested error causes are serialized.
 */
const MAX_ERROR_CAUSE_DEPTH = 5;

/**
 * Options controlling error serialization.
 */
export interface LogErrorSerializationOptions {
  /**
   * Redaction hook applied to the sanitized details of every
   * error in the cause chain.
   */
  readonly redact?: (value: unknown) => unknown;
}

/**
 * Creates a structured LogError from an unknown thrown value.
 *
 * This allows the logging system to safely handle:
 *
 * Error instances
 * FrameworkError instances
 * Strings
 * Objects
 * Unknown thrown values
 *
 * Nested causes are serialized recursively up to a bounded
 * depth, and details pass through the safe sanitizer (and the
 * optional redaction hook) so circular references and BigInt
 * values cannot crash logging and secrets do not leak.
 */
export function serializeLogError(
  error: unknown,
  options: LogErrorSerializationOptions = {},
): LogError {
  return serializeLogErrorAtDepth(error, options, 0);
}

function serializeDetails(
  value: unknown,
  options: LogErrorSerializationOptions,
): unknown {
  const sanitized = sanitizeLogValue(value);
  return options.redact ? options.redact(sanitized) : sanitized;
}

function serializeLogErrorAtDepth(
  error: unknown,
  options: LogErrorSerializationOptions,
  depth: number,
): LogError {
  if (error instanceof Error) {
    const candidate = error as Error & {
      code?: string;
      details?: unknown;
      cause?: unknown;
    };

    return {
      name: candidate.name,
      message: candidate.message,
      stack: candidate.stack,
      code: candidate.code,
      details:
        candidate.details !== undefined
          ? serializeDetails(candidate.details, options)
          : undefined,
      cause:
        candidate.cause !== undefined
          ? depth < MAX_ERROR_CAUSE_DEPTH
            ? serializeLogErrorAtDepth(candidate.cause, options, depth + 1)
            : "[MaxDepth]"
          : undefined,
    };
  }

  if (typeof error === "string") {
    return {
      message: error,
    };
  }

  if (error !== null && typeof error === "object") {
    return {
      details: serializeDetails(error, options),
    };
  }

  return {
    message: String(error),
  };
}

/**
 * Maximum depth to which arbitrary values are sanitized.
 */
const MAX_SANITIZE_DEPTH = 16;

/**
 * Converts an arbitrary value into a JSON-safe structure.
 *
 * Handles the cases that break JSON.stringify:
 *
 * circular references → "[Circular]"
 * BigInt              → decimal string
 * throwing toJSON     → "[Unserializable]"
 * functions           → "[Function name]"
 * symbols             → their string description
 */
export function sanitizeLogValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): unknown {
  if (value === null || value === undefined) return value;

  const type = typeof value;

  if (type === "bigint") return (value as bigint).toString();
  if (type === "function")
    return `[Function ${(value as { name?: string }).name || "anonymous"}]`;
  if (type === "symbol") return String(value);
  if (type !== "object") return value;

  const objectValue = value as object;

  if (seen.has(objectValue)) return "[Circular]";
  if (depth >= MAX_SANITIZE_DEPTH) return "[MaxDepth]";

  if (objectValue instanceof Date) return objectValue.toISOString();
  if (objectValue instanceof Error)
    return serializeLogErrorAtDepth(objectValue, {}, MAX_ERROR_CAUSE_DEPTH);

  seen.add(objectValue);

  try {
    const withToJson = objectValue as { toJSON?: () => unknown };
    if (typeof withToJson.toJSON === "function") {
      let converted: unknown;
      try {
        converted = withToJson.toJSON();
      } catch {
        return "[Unserializable]";
      }
      if (converted !== objectValue) {
        return sanitizeLogValue(converted, seen, depth + 1);
      }
    }

    if (Array.isArray(objectValue)) {
      return objectValue.map((item) => sanitizeLogValue(item, seen, depth + 1));
    }

    if (objectValue instanceof Map) {
      const result: Record<string, unknown> = {};
      for (const [key, item] of objectValue.entries()) {
        result[String(key)] = sanitizeLogValue(item, seen, depth + 1);
      }
      return result;
    }

    if (objectValue instanceof Set) {
      return [...objectValue].map((item) =>
        sanitizeLogValue(item, seen, depth + 1),
      );
    }

    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(objectValue)) {
      /*
       * Assigning result["__proto__"] would replace the prototype
       * (and drop the value from serialized output) instead of
       * storing the key, so own "__proto__" keys — as produced by
       * JSON.parse on untrusted input — are defined explicitly.
       */
      Object.defineProperty(result, key, {
        value: sanitizeLogValue(item, seen, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return result;
  } finally {
    seen.delete(objectValue);
  }
}

/**
 * Safely serializes an arbitrary value to a JSON string.
 *
 * Never throws: values that resist serialization degrade to
 * placeholder strings.
 */
export function safeLogStringify(value: unknown): string {
  try {
    return JSON.stringify(sanitizeLogValue(value));
  } catch {
    return '"[Unserializable]"';
  }
}
