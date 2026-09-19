/**
 * Base CQRS error, owned here so `@zudojs/cqrs` can extend or re-export it.
 */

import type { BaseErrorOptions } from "../../base/types/baseError.type.js";
import { BaseError } from "../../base/core/baseError.core.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/**
 * Base error for failures originating from the CQRS package.
 *
 * Defaults: `ErrorCode.INTERNAL_ERROR`, category `system`, 500, not exposed.
 */
export class CqrsError extends BaseError {
  constructor(message: string, options: BaseErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.INTERNAL_ERROR,
      category: options.category ?? ErrorCategory.SYSTEM,
      severity: options.severity ?? ErrorSeverity.ERROR,
      statusCode: options.statusCode ?? 500,
      expose: options.expose ?? false,
      isOperational: options.isOperational ?? true,
    });
  }
}
