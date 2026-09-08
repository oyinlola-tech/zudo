import { ErrorCategory } from "../types/errorCategory.type.js";
import { ErrorCode } from "../types/errorCode.type.js";
import { ErrorSeverity } from "../types/errorSeverity.type.js";
import type { ErrorMetadata } from "./errorMetadata.type.js";
import {
  createErrorMetadata,
  serializeErrorMetadata,
} from "./errorMetadata.core.js";
import type {
  BaseErrorOptions,
  SerializedBaseError,
} from "../types/baseError.type.js";

/**
 * Brand used to recognise BaseError instances across duplicated copies of
 * this package (for example when two versions of `@zudojs/errors` are
 * installed side by side and `instanceof` fails across the boundary).
 */
export const BASE_ERROR_BRAND: unique symbol = Symbol.for(
  "@zudojs/errors.BaseError",
);

/** Maximum depth of cause chains included in serialized output. */
const MAX_CAUSE_DEPTH = 8;

/** Errors currently being serialized (guards against cyclic cause chains). */
const serializing = new WeakSet<object>();

/**
 * Base error class shared by all Zudojs application errors.
 *
 * Provides a consistent structure for error handling, logging,
 * HTTP responses, monitoring, and serialization.
 */
export class BaseError extends Error {
  public readonly code: ErrorCode | string;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly statusCode: number;
  public readonly expose: boolean;
  public readonly isOperational: boolean;
  public readonly metadata: Readonly<ErrorMetadata>;
  public override readonly cause: unknown;
  /** Brand marker; always `true` on BaseError instances (non-enumerable). */
  public declare readonly [BASE_ERROR_BRAND]: true;

  constructor(message: string, options: BaseErrorOptions = {}) {
    super(
      message,
      options.cause !== undefined ? { cause: options.cause } : undefined,
    );

    this.name = new.target.name;
    this.code = options.code ?? ErrorCode.UNKNOWN;
    this.category = options.category ?? ErrorCategory.UNKNOWN;
    this.severity = options.severity ?? ErrorSeverity.ERROR;
    this.statusCode = normalizeStatusCode(options.statusCode);
    this.expose = options.expose ?? this.statusCode < 500;
    this.isOperational = options.isOperational ?? true;
    this.metadata = createErrorMetadata(options.metadata);
    this.cause = options.cause;

    Object.defineProperty(this, BASE_ERROR_BRAND, {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false,
    });

    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Returns whether this error is safe to expose to clients. */
  public isPublic(): boolean {
    return this.expose;
  }

  /** Returns whether this error represents an operational failure. */
  public isOperationalError(): boolean {
    return this.isOperational;
  }

  /** Returns a metadata value by key. */
  public getMetadata(key: string) {
    if (!Object.prototype.hasOwnProperty.call(this.metadata, key))
      return undefined;
    return this.metadata[key];
  }

  /**
   * Creates a copy of this error with additional metadata.
   *
   * The copy is produced by cloning the instance (prototype, own properties,
   * message, stack and cause) rather than re-invoking the constructor, so it
   * works for every subclass regardless of its constructor signature.
   */
  public withMetadata(metadata: ErrorMetadata): this {
    const clone = Object.create(Object.getPrototypeOf(this)) as this;

    for (const key of Reflect.ownKeys(this)) {
      if (key === "stack") continue;
      const descriptor = Object.getOwnPropertyDescriptor(this, key);
      if (descriptor === undefined) continue;
      Object.defineProperty(clone, key, descriptor);
    }

    // V8 exposes `stack` as an accessor bound to the original object; copy
    // its current value as a plain data property instead.
    Object.defineProperty(clone, "stack", {
      value: this.stack,
      enumerable: false,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(clone, "metadata", {
      value: createErrorMetadata({ ...this.metadata, ...metadata }),
      enumerable: true,
      writable: false,
      configurable: true,
    });

    return clone;
  }

  /**
   * Converts the error into a serializable representation.
   *
   * Intended for trusted internal logging: includes the stack trace and the
   * cause chain (depth-limited and cycle-safe). Use `ErrorSerializer`
   * (`serializePublicError`) for anything sent to an untrusted client.
   */
  public toJSON(): SerializedBaseError {
    const base: SerializedBaseError = {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      severity: this.severity,
      statusCode: this.statusCode,
      expose: this.expose,
      isOperational: this.isOperational,
      metadata: serializeErrorMetadata(this.metadata),
      ...(this.stack ? { stack: this.stack } : {}),
    };

    if (this.cause === undefined) return base;

    if (serializing.has(this)) {
      return { ...base, cause: "[Circular]" };
    }

    serializing.add(this);
    try {
      return { ...base, cause: serializeErrorCause(this.cause, 1) };
    } finally {
      serializing.delete(this);
    }
  }

  /** Returns the error as a plain object for internal logging. */
  public toLogObject(): SerializedBaseError {
    return this.toJSON();
  }

  /** Returns a concise error description. */
  public override toString(): string {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}

/**
 * Normalizes HTTP status codes to valid range.
 */
function normalizeStatusCode(statusCode: number | undefined): number {
  if (statusCode === undefined) return 500;
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
    throw new RangeError(
      "Error statusCode must be an integer between 100 and 599.",
    );
  }
  return statusCode;
}

/**
 * Serializes nested Error causes while avoiding recursive failures.
 *
 * Cause chains are cycle-safe and truncated after `MAX_CAUSE_DEPTH` levels.
 */
export function serializeErrorCause(
  cause: unknown,
  depth = 1,
): SerializedBaseError | unknown {
  if (depth > MAX_CAUSE_DEPTH) return "[MaxDepth]";

  if (cause instanceof BaseError) {
    if (serializing.has(cause)) return "[Circular]";
    return cause.toJSON();
  }

  if (cause instanceof Error) {
    if (serializing.has(cause)) return "[Circular]";
    serializing.add(cause);
    try {
      return {
        name: cause.name,
        message: cause.message,
        ...(cause.stack ? { stack: cause.stack } : {}),
        ...(cause.cause !== undefined
          ? { cause: serializeErrorCause(cause.cause, depth + 1) }
          : {}),
      };
    } finally {
      serializing.delete(cause);
    }
  }

  if (cause !== null && typeof cause === "object") {
    if (serializing.has(cause)) return "[Circular]";
    return cause;
  }

  return cause;
}
