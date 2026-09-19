/**
 * Error re-exports for the Identity service.
 *
 * All error classes are imported from @zudojs/errors to avoid duplication.
 */

import {
  ApplicationError as BaseApplicationError,
  NotFoundError as BaseNotFoundError,
  ConflictError as BaseConflictError,
  AuthenticationError as BaseUnauthorizedError,
} from "@zudojs/errors";
import type { ErrorMetadata } from "@zudojs/errors";

/**
 * Generic application error for the identity domain.
 */
export class ApplicationError extends BaseApplicationError {
  constructor(
    message: string,
    options?: {
      readonly statusCode?: number;
      readonly metadata?: ErrorMetadata;
    },
  ) {
    super(message, options);
  }
}

/**
 * Resource not found error.
 */
export class NotFoundError extends BaseNotFoundError {
  constructor(
    message: string,
    options?: {
      readonly statusCode?: number;
      readonly metadata?: ErrorMetadata;
    },
  ) {
    super(message, options);
  }
}

/**
 * Conflict error (e.g. duplicate email).
 */
export class ConflictError extends BaseConflictError {
  constructor(
    message: string,
    options?: {
      readonly statusCode?: number;
      readonly metadata?: ErrorMetadata;
    },
  ) {
    super(message, options);
  }
}

/**
 * Unauthorized / authentication error.
 */
export class UnauthorizedError extends BaseUnauthorizedError {
  constructor(
    message: string,
    options?: {
      readonly statusCode?: number;
      readonly metadata?: ErrorMetadata;
    },
  ) {
    super(message, options);
  }
}
