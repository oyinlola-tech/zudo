/**
 * Base HTTP error class for the HTTP package.
 *
 * Extends the shared HttpError from @zudojs/errors with HTTP-specific
 * response properties like statusText, headers, and details.
 *
 * @module httpErrors/base
 */

import { HttpError as BaseHttpError } from "@zudojs/errors";

import type { HttpErrorOptions } from "./httpError.type.js";

import { normalizeHeaders, getStatusText } from "./httpError.util.js";

/**
 * HTTP error with response-specific properties.
 *
 * Extends the shared HttpError from @zudojs/errors with additional
 * properties for HTTP response construction.
 */
export class HttpError extends BaseHttpError {
  /**
   * The HTTP status text.
   */
  readonly statusText: string;

  /**
   * Additional error details.
   */
  readonly details: unknown;

  /**
   * Custom response headers.
   */
  readonly headers: Readonly<Record<string, string>>;

  constructor(
    status: number,
    message?: string,
    options: HttpErrorOptions = {},
  ) {
    const statusText = getStatusText(status);

    super(message ?? statusText, {
      statusCode: status,
      code: options.code,
      expose: options.expose ?? status < 500,
      metadata: options.metadata,
      cause: options.cause,
    });

    this.name = "HttpError";

    this.statusText = statusText;

    this.details = options.details;

    this.headers = Object.freeze(normalizeHeaders(options.headers));
  }

  /**
   * Creates a new error with an additional header.
   */
  withHeader(name: string, value: string): HttpError {
    return new HttpError(this.statusCode, this.message, {
      code: this.code,
      headers: {
        ...this.headers,
        [name]: value,
      },
      details: this.details,
      expose: this.expose,
      metadata: this.metadata,
      /* An additive transform must not sever the original error chain. */
      cause: this.cause,
    });
  }

  /**
   * Creates a new error with updated details.
   */
  withDetails(details: unknown): HttpError {
    return new HttpError(this.statusCode, this.message, {
      code: this.code,
      headers: this.headers as Record<string, string>,
      details,
      expose: this.expose,
      metadata: this.metadata,
      cause: this.cause,
    });
  }
}
