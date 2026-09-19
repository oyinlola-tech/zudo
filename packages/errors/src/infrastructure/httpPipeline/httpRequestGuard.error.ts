/**
 * Error thrown when an HTTP request security guard rejects a request.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";

/** The parts of a guard verdict this error records. */
export interface HttpRequestGuardRejection {
  /** Status the response should use (400-499). */
  readonly statusCode: number;
  /** Individual validation failures, for logs only. */
  readonly errors: readonly string[];
}

/**
 * Carries the status the response should use and the individual failures, so
 * a caller can log the detail without returning it to the client (not
 * exposed). Matches `@zudojs/http`'s local class, which extended `Error`.
 */
export class HttpRequestGuardError extends BaseError {
  readonly errors: readonly string[];

  constructor(result: HttpRequestGuardRejection) {
    const errors = Array.isArray(result?.errors) ? [...result.errors] : [];
    const status = result?.statusCode;
    super(`Request rejected by security guard: ${errors.join("; ")}`, {
      code: "HTTP_REQUEST_REJECTED",
      category: ErrorCategory.VALIDATION,
      statusCode:
        Number.isInteger(status) && status >= 400 && status <= 499
          ? status
          : 400,
      expose: false,
    });
    this.name = "HttpRequestGuardError";
    this.errors = Object.freeze(errors);
  }
}
