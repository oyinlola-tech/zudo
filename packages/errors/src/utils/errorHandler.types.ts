/**
 * Error handler types and interfaces.
 */

import { BaseError } from "../base/core/baseError.core.js";
import { ErrorCategory } from "../base/types/errorCategory.type.js";
import { ErrorSeverity } from "../base/types/errorSeverity.type.js";

/** Context supplied when handling an error. */
export interface ErrorHandlerContext {
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly userId?: string;
  readonly service?: string;
  readonly operation?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Normalized representation of an unknown error. */
export interface NormalizedError {
  readonly error: BaseError;
  readonly original: unknown;
}

/**
 * Structured result returned by the error handler.
 *
 * This is the INTERNAL representation (classification fields and redacted
 * metadata included); use `ErrorHandler.toPublicResult` / `PublicErrorHandlerResult`
 * for anything returned to an untrusted client.
 */
export interface ErrorHandlerResult {
  readonly code: string;
  readonly message: string;
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  readonly statusCode: number;
  readonly isOperational: boolean;
  readonly expose: boolean;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Client-safe result returned by `ErrorHandler.toPublicResult`. */
export interface PublicErrorHandlerResult {
  readonly code: string;
  readonly message: string;
  readonly statusCode: number;
  readonly requestId?: string;
  readonly correlationId?: string;
  /** Allow-listed, redacted metadata (see `ErrorHandlerOptions.publicMetadataKeys`). */
  readonly details?: Readonly<Record<string, unknown>>;
}

/** Callback used to report errors to an external logger or monitoring system. */
export type ErrorReporter = (
  error: BaseError,
  context?: ErrorHandlerContext,
) => void | Promise<void>;

/** Callback invoked when the reporter itself fails. */
export type ErrorReporterFailureHandler = (
  reporterError: unknown,
  originalError: BaseError,
  context?: ErrorHandlerContext,
) => void;

/** Options for constructing an ErrorHandler. */
export interface ErrorHandlerOptions {
  readonly reporter?: ErrorReporter;
  /**
   * Invoked when `reporter` throws or rejects. Reporter failures never
   * propagate out of `handle`/`report`; when this hook is absent they are
   * swallowed.
   */
  readonly onReporterError?: ErrorReporterFailureHandler;
  readonly defaultStatusCode?: number;
  readonly defaultMessage?: string;
  /**
   * Include the stack trace in `toLogObject` output. Stacks are never
   * included in `toResult`, `toPublicResult` or `serialize`.
   */
  readonly includeStack?: boolean;
  /**
   * Metadata keys copied into `PublicErrorHandlerResult.details`. When omitted,
   * exposed errors contribute their (redacted) metadata and non-exposed errors
   * contribute nothing.
   */
  readonly publicMetadataKeys?: readonly string[];
  /** Pattern used to detect sensitive metadata keys. */
  readonly sensitiveKeyPattern?: RegExp;
}
