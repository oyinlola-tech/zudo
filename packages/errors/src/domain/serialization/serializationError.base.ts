/**
 * Base SerializationError class, options, and factory functions.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";
import { safeErrorMessage } from "../shared/domainError.helpers.js";

/** Options for creating a serialization error. */
export interface SerializationErrorOptions extends Omit<
  BaseErrorOptions,
  "category"
> {
  readonly category?: ErrorCategory;
  readonly format?: string;
  readonly depth?: number;
  readonly maxDepth?: number;
  readonly size?: number;
  readonly maxSize?: number;
  readonly transformerType?: string;
  readonly serializerName?: string;
}

/** Diagnostic fields carried by serialization errors. */
const DIAGNOSTIC_KEYS = [
  "format",
  "depth",
  "maxDepth",
  "size",
  "maxSize",
  "transformerType",
  "serializerName",
] as const;

/** Base error for all serialization subsystem failures. */
export class SerializationError extends BaseError {
  public readonly format?: string;
  public readonly depth?: number;
  public readonly maxDepth?: number;
  public readonly size?: number;
  public readonly maxSize?: number;
  public readonly transformerType?: string;
  public readonly serializerName?: string;

  constructor(message: string, options: SerializationErrorOptions = {}) {
    const diagnostics: Record<string, string | number> = {};
    for (const key of DIAGNOSTIC_KEYS) {
      const value = options[key];
      if (value !== undefined) diagnostics[key] = value;
    }
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.SERIALIZATION,
      category: options.category ?? ErrorCategory.OPERATION,
      severity: options.severity ?? ErrorSeverity.ERROR,
      statusCode: options.statusCode ?? 500,
      expose: options.expose ?? false,
      isOperational: options.isOperational ?? true,
      metadata: { ...options.metadata, ...diagnostics },
    });
    this.format = options.format;
    this.depth = options.depth;
    this.maxDepth = options.maxDepth;
    this.size = options.size;
    this.maxSize = options.maxSize;
    this.transformerType = options.transformerType;
    this.serializerName = options.serializerName;
  }

  public override toJSON() {
    const diagnostics: Record<string, string | number> = {};
    for (const key of DIAGNOSTIC_KEYS) {
      const value = this[key];
      if (value !== undefined) diagnostics[key] = value;
    }
    return {
      ...super.toJSON(),
      ...diagnostics,
    };
  }
}

/** Creates a serialization error. */
export function createSerializationError(
  message: string,
  options: SerializationErrorOptions = {},
): SerializationError {
  return new SerializationError(message, options);
}

/** Determines whether an unknown value is a SerializationError. */
export function isSerializationError(
  value: unknown,
): value is SerializationError {
  return value instanceof SerializationError;
}

/** Converts an unknown thrown value into a SerializationError. */
export function toSerializationError(
  error: unknown,
  options: { message?: string; code?: ErrorCode | string } = {},
): SerializationError {
  if (error instanceof SerializationError) {
    return error;
  }
  return new SerializationError(options.message ?? safeErrorMessage(error), {
    code: options.code,
    cause: error,
  });
}
