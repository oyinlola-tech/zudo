/**
 * External service error factory functions.
 */

import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";
import { ExternalServiceError } from "./externalServiceError.base.js";

/** Creates an external service timeout error. */
export function externalServiceTimeoutError(
  service: string,
  operation?: string,
): ExternalServiceError {
  return new ExternalServiceError(`The ${service} request timed out.`, {
    service,
    operation,
    code: ErrorCode.EXTERNAL_SERVICE_TIMEOUT,
    category: ErrorCategory.EXTERNAL_SERVICE,
    severity: ErrorSeverity.WARNING,
    statusCode: 504,
    expose: false,
  });
}

/** Creates an external service unavailable error. */
export function externalServiceUnavailableError(
  service: string,
  operation?: string,
): ExternalServiceError {
  return new ExternalServiceError(`${service} is currently unavailable.`, {
    service,
    operation,
    code: ErrorCode.EXTERNAL_SERVICE_UNAVAILABLE,
    category: ErrorCategory.EXTERNAL_SERVICE,
    severity: ErrorSeverity.ERROR,
    statusCode: 503,
    expose: false,
  });
}

/** @deprecated Use `externalServiceUnavailableError`. */
export const externalServiceUnavailable = externalServiceUnavailableError;
