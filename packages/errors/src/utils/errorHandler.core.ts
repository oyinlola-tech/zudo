/**
 * Centralized error normalization, serialization, and reporting service.
 */

import type { BaseError } from "../base/core/baseError.core.js";
import {
  pickErrorMetadata,
  redactErrorMetadata,
  serializeErrorMetadata,
} from "../base/core/errorMetadata.core.js";
import type { ErrorMetadata } from "../base/core/errorMetadata.type.js";
import {
  isBaseError,
  normalizeUnknownToBaseError,
} from "../base/utils/baseError.utils.js";
import { ErrorSerializer } from "./errorSerializer.core.js";
import type {
  ErrorHandlerOptions,
  ErrorHandlerResult,
  ErrorHandlerContext,
  ErrorReporter,
  ErrorReporterFailureHandler,
  NormalizedError,
  PublicErrorHandlerResult,
} from "./errorHandler.types.js";

export type {
  ErrorHandlerOptions,
  ErrorHandlerResult,
  ErrorHandlerContext,
  ErrorReporter,
  ErrorReporterFailureHandler,
  NormalizedError,
  PublicErrorHandlerResult,
} from "./errorHandler.types.js";
export {
  createErrorHandler,
  normalizeError,
  isHandledError,
} from "./errorHandler.factory.js";

/** Centralized error normalization, serialization, and reporting service. */
export class ErrorHandler {
  private readonly reporter?: ErrorReporter;
  private readonly onReporterError?: ErrorReporterFailureHandler;
  private readonly defaultStatusCode: number;
  private readonly defaultMessage: string;
  private readonly includeStack: boolean;
  private readonly publicMetadataKeys: readonly string[] | undefined;
  private readonly sensitiveKeyPattern: RegExp | undefined;

  constructor(options: ErrorHandlerOptions = {}) {
    this.reporter = options.reporter;
    this.onReporterError = options.onReporterError;
    this.defaultStatusCode = options.defaultStatusCode ?? 500;
    this.defaultMessage =
      options.defaultMessage ?? "An unexpected error occurred.";
    this.includeStack = options.includeStack ?? false;
    this.publicMetadataKeys = options.publicMetadataKeys;
    this.sensitiveKeyPattern = options.sensitiveKeyPattern;
  }

  /** Converts an unknown thrown value into a BaseError. */
  public normalize(value: unknown): NormalizedError {
    if (isBaseError(value)) {
      return { error: value, original: value };
    }
    const error = normalizeUnknownToBaseError(value, {
      statusCode: this.defaultStatusCode,
      ...(value instanceof Error || typeof value === "string"
        ? {}
        : { message: this.defaultMessage }),
    });
    return { error, original: value };
  }

  /**
   * Handles and normalizes an unknown error.
   *
   * The reporter is isolated: if it throws or rejects, the failure is passed
   * to `onReporterError` (or swallowed) and the original error's result is
   * still returned.
   */
  public async handle(
    value: unknown,
    context?: ErrorHandlerContext,
  ): Promise<ErrorHandlerResult> {
    const { error } = this.normalize(value);
    await this.reportSafely(error, context);
    return this.toResult(error, context);
  }

  /** Handles an unknown error and returns the client-safe representation. */
  public async handlePublic(
    value: unknown,
    context?: ErrorHandlerContext,
  ): Promise<PublicErrorHandlerResult> {
    const { error } = this.normalize(value);
    await this.reportSafely(error, context);
    return this.toPublicResult(error, context);
  }

  /**
   * Converts a BaseError into the internal result object.
   *
   * Metadata is redacted recursively; the stack is never included.
   */
  public toResult(
    error: BaseError,
    context?: ErrorHandlerContext,
  ): ErrorHandlerResult {
    const metadata = this.redact({
      ...serializeErrorMetadata(error.metadata),
      ...(context?.metadata ?? {}),
    });
    return {
      code: error.code,
      message: error.expose ? error.message : this.defaultMessage,
      category: error.category,
      severity: error.severity,
      statusCode: error.statusCode,
      isOperational: error.isOperational,
      expose: error.expose,
      ...(context?.requestId ? { requestId: context.requestId } : {}),
      ...(context?.correlationId
        ? { correlationId: context.correlationId }
        : {}),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    };
  }

  /**
   * Converts a BaseError into a client-safe result.
   *
   * Only `code`, `message`, `statusCode`, request/correlation ids and
   * allow-listed metadata (`details`) are included. Internal classification
   * fields and non-exposed metadata are never revealed.
   */
  public toPublicResult(
    error: BaseError,
    context?: ErrorHandlerContext,
  ): PublicErrorHandlerResult {
    let details: Readonly<ErrorMetadata> | undefined;
    if (this.publicMetadataKeys !== undefined) {
      details = this.redact(
        pickErrorMetadata(error.metadata, this.publicMetadataKeys),
      );
    } else if (error.expose) {
      details = this.redact(error.metadata);
    }

    return {
      code: error.code,
      message: error.expose ? error.message : this.defaultMessage,
      statusCode: error.statusCode,
      ...(context?.requestId ? { requestId: context.requestId } : {}),
      ...(context?.correlationId
        ? { correlationId: context.correlationId }
        : {}),
      ...(details !== undefined && Object.keys(details).length > 0
        ? { details }
        : {}),
    };
  }

  /** Reports an error without producing a response. */
  public async report(
    value: unknown,
    context?: ErrorHandlerContext,
  ): Promise<BaseError> {
    const { error } = this.normalize(value);
    await this.reportSafely(error, context);
    return error;
  }

  /** Determines whether an error should expose its message to clients. */
  public shouldExpose(error: BaseError): boolean {
    return error.expose;
  }

  /**
   * Returns a safe serialized error representation (never includes a stack).
   *
   * Equivalent to `toPublicResult`; kept for backwards compatibility.
   */
  public serialize(
    error: BaseError,
    context?: ErrorHandlerContext,
  ): Record<string, unknown> {
    return this.toPublicResult(error, context) as unknown as Record<
      string,
      unknown
    >;
  }

  /**
   * Returns the full internal representation for logging, including the
   * (redacted) cause chain and, when `includeStack` is enabled, stack traces.
   */
  public toLogObject(
    error: BaseError,
    context?: ErrorHandlerContext,
  ): Record<string, unknown> {
    const serialized = new ErrorSerializer({
      includeStack: this.includeStack,
      includeCause: true,
      includeMetadata: true,
      redactSensitiveData: true,
      sensitiveKeyPattern: this.sensitiveKeyPattern,
    }).serialize(error);
    return {
      ...serialized,
      ...(context?.requestId ? { requestId: context.requestId } : {}),
      ...(context?.correlationId
        ? { correlationId: context.correlationId }
        : {}),
      ...(context?.metadata
        ? { context: this.redact(context.metadata) }
        : {}),
    };
  }

  /** Invokes the reporter without letting its failure escape. */
  private async reportSafely(
    error: BaseError,
    context?: ErrorHandlerContext,
  ): Promise<void> {
    if (!this.reporter) return;
    try {
      await this.reporter(error, context);
    } catch (reporterError) {
      if (this.onReporterError) {
        try {
          this.onReporterError(reporterError, error, context);
        } catch {
          // A failing failure-handler must never break error handling.
        }
      }
    }
  }

  /** Removes obviously sensitive fields from metadata (recursively). */
  private redact(
    metadata: Readonly<Record<string, unknown>> | undefined,
  ): Readonly<ErrorMetadata> {
    return redactErrorMetadata(metadata, {
      sensitiveKeyPattern: this.sensitiveKeyPattern,
    });
  }
}
