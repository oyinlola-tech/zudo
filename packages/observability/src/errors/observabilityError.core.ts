/**
 * @zudojs/observability — Errors
 *
 * Telemetry must never be the reason an application fails, so this package
 * throws only for programmer errors — a malformed configuration, a metric
 * recorded with a value that cannot be aggregated. Failures in the transport
 * layer are reported through `ObservabilityConfig.onError` instead.
 */

import {
  BaseError,
  ErrorCode,
  ErrorCategory,
  ErrorSeverity,
} from "@zudojs/errors";

/** Base error for all observability failures. */
export class ObservabilityError extends BaseError {
  constructor(
    message: string,
    options?: {
      readonly code?: ErrorCode;
      readonly metadata?: Readonly<Record<string, unknown>>;
      readonly cause?: unknown;
    },
  ) {
    super(message, {
      code: options?.code ?? ErrorCode.OPERATION_FAILED,
      category: ErrorCategory.INTERNAL,
      severity: ErrorSeverity.ERROR,
      statusCode: 500,
      expose: false,
      metadata: options?.metadata as never,
      cause: options?.cause,
    });
    this.name = "ObservabilityError";
  }
}

/** An exporter failed to deliver telemetry. */
export class ExporterError extends ObservabilityError {
  constructor(exporterName: string, cause?: unknown) {
    super(`Exporter "${exporterName}" failed to export telemetry`, {
      metadata: { exporterName },
      cause,
    });
    this.name = "ExporterError";
  }
}

/** A configuration value is unusable. */
export class ObservabilityConfigError extends ObservabilityError {
  constructor(message: string, metadata?: Readonly<Record<string, unknown>>) {
    super(message, { code: ErrorCode.VALIDATION_FAILED, metadata });
    this.name = "ObservabilityConfigError";
  }
}

/** A metric was given a value it cannot aggregate. */
export class MetricValueError extends ObservabilityError {
  constructor(metricName: string, value: number, reason: string) {
    super(`Metric "${metricName}" rejected value ${value}: ${reason}`, {
      code: ErrorCode.VALIDATION_FAILED,
      metadata: { metricName, value, reason },
    });
    this.name = "MetricValueError";
  }
}

/** Determines whether an unknown value is an observability error. */
export function isObservabilityError(
  value: unknown,
): value is ObservabilityError {
  return value instanceof ObservabilityError;
}
