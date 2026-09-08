/**
 * Network error factory functions.
 */

import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { NetworkError, type NetworkErrorOptions } from "./networkError.base.js";

/** Creates a connection failure error. */
export function connectionFailedError(
  service?: string,
  options: Omit<NetworkErrorOptions, "service"> = {},
): NetworkError {
  return new NetworkError(
    service
      ? `Unable to connect to ${service}.`
      : "Unable to establish a network connection.",
    { ...options, code: ErrorCode.CONNECTION_FAILED, service },
  );
}

/** Creates a network timeout error. */
export function networkTimeoutError(
  service?: string,
  options: Omit<NetworkErrorOptions, "service"> = {},
): NetworkError {
  return new NetworkError(
    service
      ? `The request to ${service} timed out.`
      : "The network request timed out.",
    {
      ...options,
      code: ErrorCode.TIMEOUT,
      category: ErrorCategory.TIMEOUT,
      statusCode: options.statusCode ?? 504,
      service,
    },
  );
}

/**
 * Creates an error for an unavailable remote service.
 *
 * @deprecated Use `externalServiceUnavailableError` from the service module
 * (creates an `ExternalServiceError`, so `isExternalServiceError` matches).
 * This variant creates a `NetworkError` and is kept for compatibility under
 * the name `networkServiceUnavailableError`.
 */
export function networkServiceUnavailableError(
  service?: string,
  options: Omit<NetworkErrorOptions, "service"> = {},
): NetworkError {
  return new NetworkError(
    service
      ? `${service} is currently unavailable.`
      : "The external service is currently unavailable.",
    {
      ...options,
      code: ErrorCode.EXTERNAL_SERVICE_UNAVAILABLE,
      category: ErrorCategory.EXTERNAL_SERVICE,
      statusCode: options.statusCode ?? 503,
      service,
    },
  );
}
