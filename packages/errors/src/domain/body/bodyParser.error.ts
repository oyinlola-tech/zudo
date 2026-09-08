import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";

import { ErrorCode } from "../../base/types/errorCode.type.js";

import { ErrorCategory } from "../../base/types/errorCategory.type.js";

import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";
import {
  MAX_METADATA_FRAGMENT_LENGTH,
  sanitizeFragment,
} from "../shared/domainError.helpers.js";

/**
 * Options for creating a body parser error.
 */
export interface BodyParserErrorOptions extends Omit<
  BaseErrorOptions,
  "category"
> {
  readonly category?: ErrorCategory;
}

/**
 * Base error class for body parser errors.
 */
export class BodyParserError extends BaseError {
  constructor(message: string, options: BodyParserErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.HTTP_BODY_PARSER,
      category: options.category ?? ErrorCategory.INPUT,
      severity: options.severity ?? ErrorSeverity.WARNING,
      statusCode: options.statusCode ?? 400,
      expose: options.expose ?? true,
    });
  }
}

/**
 * Error thrown when an unsupported body type is encountered.
 *
 * Responds with 415 Unsupported Media Type. The header value is untrusted
 * input: it is stripped of control characters and truncated before being
 * embedded in the message or metadata.
 */
export class UnsupportedBodyTypeError extends BodyParserError {
  /**
   * The unsupported content type (sanitized and truncated).
   */
  public readonly contentType: string;

  constructor(contentType: string) {
    const safeContentType = sanitizeFragment(
      contentType,
      MAX_METADATA_FRAGMENT_LENGTH,
    );
    super(
      `Unsupported request content type: ${sanitizeFragment(contentType)}`,
      {
        code: ErrorCode.HTTP_UNSUPPORTED_BODY_TYPE,
        statusCode: 415,
        metadata: {
          contentType: safeContentType,
        },
      },
    );

    this.contentType = safeContentType;
  }
}

/**
 * Error thrown when the Content-Length header is invalid.
 *
 * The header value is untrusted input: it is stripped of control characters
 * and truncated before being embedded in the message or metadata.
 */
export class InvalidContentLengthError extends BodyParserError {
  /**
   * The invalid Content-Length value (sanitized and truncated).
   */
  public readonly value: string;

  constructor(value: string) {
    const safeValue = sanitizeFragment(value, MAX_METADATA_FRAGMENT_LENGTH);
    super(`Invalid Content-Length header: ${sanitizeFragment(value)}`, {
      code: ErrorCode.HTTP_INVALID_CONTENT_LENGTH,
      metadata: {
        value: safeValue,
      },
    });

    this.value = safeValue;
  }
}

/**
 * Creates a body parser error.
 */
export function createBodyParserError(
  message: string,
  options: BodyParserErrorOptions = {},
): BodyParserError {
  return new BodyParserError(message, options);
}

/**
 * Determines whether an unknown value is a BodyParserError.
 */
export function isBodyParserError(value: unknown): value is BodyParserError {
  return value instanceof BodyParserError;
}
