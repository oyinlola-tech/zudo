import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";

import { ErrorCategory } from "../../base/types/errorCategory.type.js";

import { ErrorCode } from "../../base/types/errorCode.type.js";

import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/**
 * Options for creating a domain error.
 */
export interface DomainErrorOptions extends Omit<BaseErrorOptions, "category"> {
  readonly category?: ErrorCategory;
}

/**
 * Error representing a business-domain rule violation.
 *
 * Domain errors are expected application conditions such as an invalid
 * state transition, a business rule violation, or an operation that
 * is not permitted by the domain model.
 */
export class DomainError extends BaseError {
  constructor(message: string, options: DomainErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.OPERATION_FAILED,
      category: options.category ?? ErrorCategory.BUSINESS,
      severity: options.severity ?? ErrorSeverity.WARNING,
      statusCode: options.statusCode ?? 422,
      isOperational: options.isOperational ?? true,
      expose: options.expose ?? true,
    });
  }
}

/**
 * Creates a domain error.
 */
export function createDomainError(
  message: string,
  options: DomainErrorOptions = {},
): DomainError {
  return new DomainError(message, options);
}

/**
 * Determines whether an unknown value is a DomainError.
 */
export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}

/**
 * Creates a domain error for an invalid domain state.
 *
 * Uses `PRECONDITION_FAILED` with HTTP 412, the status that matches the code.
 */
export function invalidDomainState(
  message: string,
  metadata?: DomainErrorOptions["metadata"],
): DomainError {
  return new DomainError(message, {
    code: ErrorCode.PRECONDITION_FAILED,
    category: ErrorCategory.BUSINESS,
    statusCode: 412,
    metadata,
  });
}

/**
 * Creates a domain error for an unsupported business operation.
 */
export function unsupportedDomainOperation(
  message: string,
  metadata?: DomainErrorOptions["metadata"],
): DomainError {
  return new DomainError(message, {
    code: ErrorCode.OPERATION_FAILED,
    category: ErrorCategory.BUSINESS,
    statusCode: 422,
    metadata,
  });
}
