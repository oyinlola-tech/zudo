/**
 * Base ExternalServiceError class, options, and factory functions.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/** Options for creating an external service error. */
export interface ExternalServiceErrorOptions extends Omit<
  BaseErrorOptions,
  "category"
> {
  readonly category?: ErrorCategory;
  readonly service: string;
  readonly operation?: string;
  readonly responseStatus?: number;
  readonly serviceCode?: string | number;
}

/** Error raised when an external dependency fails. */
export class ExternalServiceError extends BaseError {
  public readonly service: string;
  public readonly operation?: string;
  public readonly responseStatus?: number;
  public readonly serviceCode?: string | number;

  constructor(
    message = "An external service operation failed.",
    options: ExternalServiceErrorOptions,
  ) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.EXTERNAL_SERVICE,
      category: options.category ?? ErrorCategory.EXTERNAL_SERVICE,
      severity: options.severity ?? ErrorSeverity.ERROR,
      statusCode:
        options.statusCode ?? mapResponseStatus(options.responseStatus),
      expose: options.expose ?? false,
      isOperational: options.isOperational ?? true,
      metadata: {
        ...options.metadata,
        service: options.service,
        ...(options.operation !== undefined
          ? { operation: options.operation }
          : {}),
        ...(options.responseStatus !== undefined
          ? { responseStatus: options.responseStatus }
          : {}),
        ...(options.serviceCode !== undefined
          ? { serviceCode: String(options.serviceCode) }
          : {}),
      },
    });
    this.service = options.service;
    this.operation = options.operation;
    this.responseStatus = options.responseStatus;
    this.serviceCode = options.serviceCode;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      service: this.service,
      ...(this.operation !== undefined ? { operation: this.operation } : {}),
      ...(this.responseStatus !== undefined
        ? { responseStatus: this.responseStatus }
        : {}),
      ...(this.serviceCode !== undefined
        ? { serviceCode: String(this.serviceCode) }
        : {}),
    };
  }
}

/** Creates an external service error. */
export function createExternalServiceError(
  service: string,
  message = "An external service operation failed.",
  options: Omit<ExternalServiceErrorOptions, "service"> = {},
): ExternalServiceError {
  return new ExternalServiceError(message, { ...options, service });
}

/** Determines whether an unknown value is an ExternalServiceError. */
export function isExternalServiceError(
  value: unknown,
): value is ExternalServiceError {
  return value instanceof ExternalServiceError;
}

/**
 * Maps a remote response status into an appropriate local HTTP status.
 *
 * An upstream failure is our problem, not our caller's: every upstream status
 * maps to 502 Bad Gateway except 429, which is passed through so that callers
 * can back off. Pass an explicit `statusCode` option to override.
 */
export function mapResponseStatus(responseStatus: number | undefined): number {
  if (responseStatus === 429) {
    return 429;
  }
  return 502;
}
