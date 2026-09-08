/**
 * Base DocumentationError class, options, and factory functions.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/** Options for creating a documentation error. */
export interface DocumentationErrorOptions extends Omit<
  BaseErrorOptions,
  "category"
> {
  readonly category?: ErrorCategory;
  readonly documentId?: string;
}

/** Base error for all documentation subsystem failures. */
export class DocumentationError extends BaseError {
  public readonly documentId?: string;

  constructor(message: string, options: DocumentationErrorOptions = {}) {
    const statusCode = options.statusCode ?? 500;
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.DOCUMENTATION_ERROR,
      category: options.category ?? ErrorCategory.DOCUMENTATION,
      severity:
        options.severity ??
        (statusCode < 500 ? ErrorSeverity.WARNING : ErrorSeverity.ERROR),
      statusCode,
      expose: options.expose ?? false,
      isOperational: options.isOperational ?? true,
    });
    this.documentId = options.documentId;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      ...(this.documentId !== undefined ? { documentId: this.documentId } : {}),
    };
  }
}

/** Creates a documentation error. */
export function createDocumentationError(
  message: string,
  options: DocumentationErrorOptions = {},
): DocumentationError {
  return new DocumentationError(message, options);
}

/** Determines whether an unknown value is a DocumentationError. */
export function isDocumentationError(
  value: unknown,
): value is DocumentationError {
  return value instanceof DocumentationError;
}
