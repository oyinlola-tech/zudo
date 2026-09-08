/**
 * Base error type for all Zudojs framework errors.
 *
 * FrameworkError extends ApplicationError from @zudojs/errors
 * to maintain backward compatibility while providing structured
 * error information for HTTP handlers, logging, and observability.
 */

import { ApplicationError, type SerializedBaseError } from "@zudojs/errors";

/**
 * Options accepted by FrameworkError.
 */
export interface FrameworkErrorOptions {
  readonly code?: string;
  readonly details?: unknown;
  readonly status?: number;
  readonly cause?: unknown;
}

/**
 * Serializable representation of a FrameworkError.
 *
 * Mirrors exactly what {@link FrameworkError.toJSON} returns: the
 * serialized BaseError fields plus the optional structured details.
 */
export type FrameworkErrorJSON = SerializedBaseError & {
  readonly details?: unknown;
};

/**
 * Base error class for all Zudojs framework errors.
 *
 * FrameworkError extends ApplicationError from @zudojs/errors
 * so all framework errors inherit BaseError properties (code,
 * category, severity, statusCode, metadata, serialization).
 */
export class FrameworkError extends ApplicationError {
  /**
   * Optional structured details associated with the error.
   */
  public readonly details?: unknown;

  /**
   * Creates a framework error.
   */
  public constructor(message: string, options: FrameworkErrorOptions = {}) {
    super(message, {
      code: options.code,
      statusCode: options.status,
      cause: options.cause,
    });

    this.name = "FrameworkError";
    this.details = options.details;
  }

  /**
   * Converts the error into a structured representation.
   */
  public override toJSON(): FrameworkErrorJSON {
    return {
      ...super.toJSON(),
      name: this.name,
      message: this.message,
      code: String(this.code),
      category: this.category,
      severity: this.severity,
      statusCode: this.statusCode,
      expose: this.expose,
      isOperational: this.isOperational,
      metadata: this.metadata,
      ...(this.details !== undefined && {
        details: this.details,
      }),
    };
  }
}
