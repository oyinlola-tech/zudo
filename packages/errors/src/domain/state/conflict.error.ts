import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/**
 * Options for creating a conflict error.
 */
export interface ConflictErrorOptions extends Omit<
  BaseErrorOptions,
  "category"
> {
  readonly category?: ErrorCategory;
}

/**
 * Error raised when an operation conflicts with the current state of a resource.
 */
export class ConflictError extends BaseError {
  constructor(
    message = "The operation conflicts with the current state of the resource.",
    options: ConflictErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.CONFLICT,
      category: options.category ?? ErrorCategory.CONFLICT,
      severity: options.severity ?? ErrorSeverity.WARNING,
      statusCode: options.statusCode ?? 409,
      expose: options.expose ?? true,
      isOperational: options.isOperational ?? true,
    });
  }
}

/** Creates a conflict error. */
export function createConflictError(
  message = "The operation conflicts with the current state of the resource.",
  options: ConflictErrorOptions = {},
): ConflictError {
  return new ConflictError(message, options);
}

/** Determines whether an unknown value is a ConflictError. */
export function isConflictError(value: unknown): value is ConflictError {
  return value instanceof ConflictError;
}

/** Creates an error indicating that a resource already exists. */
export function alreadyExistsError(
  resource: string,
  identifier?: string | number,
): ConflictError {
  const message =
    identifier !== undefined
      ? `${resource} with identifier "${String(identifier)}" already exists.`
      : `${resource} already exists.`;

  return new ConflictError(message, {
    code: ErrorCode.ALREADY_EXISTS,
    category: ErrorCategory.CONFLICT,
    statusCode: 409,
    expose: true,
    metadata: {
      resource,
      ...(identifier !== undefined ? { identifier: String(identifier) } : {}),
    },
  });
}

/** Creates an error indicating that a duplicate value was submitted. */
export function duplicateError(
  field: string,
  value?: string | number,
): ConflictError {
  const message =
    value !== undefined
      ? `A value for ${field} already exists: "${String(value)}".`
      : `A value for ${field} already exists.`;

  return new ConflictError(message, {
    code: ErrorCode.DUPLICATE,
    category: ErrorCategory.CONFLICT,
    statusCode: 409,
    expose: true,
    metadata: {
      field,
      ...(value !== undefined ? { value: String(value) } : {}),
    },
  });
}

/** Creates an error indicating that a resource is currently locked (HTTP 423). */
export function resourceLockedError(
  resource: string,
  identifier?: string | number,
): ConflictError {
  const message =
    identifier !== undefined
      ? `${resource} with identifier "${String(identifier)}" is currently locked.`
      : `${resource} is currently locked.`;

  return new ConflictError(message, {
    code: ErrorCode.RESOURCE_LOCKED,
    category: ErrorCategory.CONFLICT,
    statusCode: 423,
    expose: true,
    metadata: {
      resource,
      ...(identifier !== undefined ? { identifier: String(identifier) } : {}),
    },
  });
}
