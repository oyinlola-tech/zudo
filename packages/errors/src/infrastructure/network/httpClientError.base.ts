/**
 * HTTP client error base class.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import type { ErrorMetadata } from "../../base/core/errorMetadata.type.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/**
 * Options for creating an HTTP client error.
 */
export interface HttpClientClientErrorOptions {
  readonly cause?: unknown;
  readonly code?: string;
  readonly expose?: boolean;
  readonly metadata?: ErrorMetadata;
  /** Local status code. Defaults to a mapping of the upstream `status` (502 for upstream failures). */
  readonly statusCode?: number;
  readonly status?: number;
  readonly statusText?: string;
  readonly url?: string;
  readonly response?: unknown;
  readonly request?: unknown;
}

/**
 * Base HTTP client error for outbound request failures.
 *
 * Extends BaseError with HTTP client-specific properties like
 * status, statusText, url, response, and request.
 */
export class HttpClientError extends BaseError {
  readonly status: number | undefined;
  readonly statusText: string | undefined;
  readonly url: string | undefined;
  readonly response: unknown;
  readonly request: unknown;

  constructor(message: string, options: HttpClientClientErrorOptions = {}) {
    const url = options.url !== undefined ? stripUrlCredentials(options.url) : undefined;
    super(message, {
      code: options.code ?? ErrorCode.HTTP_CLIENT,
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.ERROR,
      statusCode: options.statusCode ?? mapUpstreamStatus(options.status),
      expose: options.expose ?? false,
      isOperational: true,
      metadata: {
        ...options.metadata,
        ...(options.status !== undefined ? { upstreamStatus: options.status } : {}),
        ...(url !== undefined ? { url } : {}),
      },
      cause: options.cause,
    });
    this.status = options.status;
    this.statusText = options.statusText;
    this.url = url;
    this.response = options.response;
    this.request = options.request;
  }

  get isNetworkError(): boolean {
    return (
      this.code === ErrorCode.HTTP_CLIENT_NETWORK ||
      this.code === "HTTP_CLIENT_NETWORK_ERROR"
    );
  }

  get isTimeoutError(): boolean {
    return (
      this.code === ErrorCode.HTTP_CLIENT_TIMEOUT ||
      this.code === "HTTP_CLIENT_TIMEOUT"
    );
  }

  get isAbortError(): boolean {
    return (
      this.code === ErrorCode.HTTP_CLIENT_ABORTED ||
      this.code === "HTTP_CLIENT_ABORTED"
    );
  }

  get isHttpStatusError(): boolean {
    return this.status !== undefined;
  }
}

/**
 * Maps an upstream HTTP status to the local status reported to our caller.
 *
 * Upstream failures are our problem, not the caller's: everything except
 * 429 (which is passed through) maps to 502 Bad Gateway.
 */
export function mapUpstreamStatus(status: number | undefined): number {
  if (status === 429) return 429;
  return 502;
}

/** Removes credentials and the query string from a URL before storing it. */
export function stripUrlCredentials(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    const withoutQuery = url.split(/[?#]/)[0] ?? url;
    return withoutQuery.replace(/\/\/[^/@]*@/, "//");
  }
}
