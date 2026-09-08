/**
 * HTTP client error subclasses.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import {
  HttpClientError,
  type HttpClientClientErrorOptions,
} from "./httpClientError.base.js";

/**
 * HTTP client timeout error.
 *
 * Thrown when an outbound HTTP request exceeds its timeout.
 */
export class HttpClientTimeoutError extends HttpClientError {
  readonly timeout: number;

  constructor(timeout: number, options: HttpClientClientErrorOptions = {}) {
    super(`HTTP request timed out after ${timeout}ms.`, {
      ...options,
      code: options.code ?? ErrorCode.HTTP_CLIENT_TIMEOUT,
      statusCode: options.statusCode ?? 504,
      metadata: { ...options.metadata, timeout },
    });
    this.timeout = timeout;
  }

  public override toJSON() {
    return { ...super.toJSON(), timeout: this.timeout };
  }
}

/** Resolves the `(request?, cause?, options?)` argument form. */
function resolveClientErrorArguments(
  request: Request | HttpClientClientErrorOptions | undefined,
  cause: unknown,
  options: HttpClientClientErrorOptions | undefined,
): HttpClientClientErrorOptions {
  if (request === undefined) {
    return { ...options, ...(cause !== undefined ? { cause } : {}) };
  }
  if (typeof Request !== "undefined" && request instanceof Request) {
    return {
      ...options,
      request,
      ...(cause !== undefined ? { cause } : {}),
    };
  }
  // Legacy form: a single options object.
  return { ...(request as HttpClientClientErrorOptions), ...options };
}

/**
 * HTTP client abort error.
 *
 * Thrown when an outbound HTTP request is aborted via AbortSignal.
 *
 * Signature: `new HttpClientAbortError(request?, cause?, options?)`. The
 * second argument is ALWAYS treated as the cause (never as options), so Node
 * system errors and `DOMException`s that happen to carry a `code` property
 * are preserved. The legacy single-options form is still accepted.
 */
export class HttpClientAbortError extends HttpClientError {
  constructor(
    request?: Request | HttpClientClientErrorOptions,
    cause?: unknown,
    options?: HttpClientClientErrorOptions,
  ) {
    const opts = resolveClientErrorArguments(request, cause, options);
    super("HTTP request was aborted.", {
      ...opts,
      code: opts.code ?? ErrorCode.HTTP_CLIENT_ABORTED,
      statusCode: opts.statusCode ?? 499,
    });
  }
}

/**
 * HTTP client network error.
 *
 * Thrown when an outbound HTTP request fails due to a network issue.
 *
 * Signature: `new HttpClientNetworkError(message, request?, cause?, options?)`.
 */
export class HttpClientNetworkError extends HttpClientError {
  constructor(
    message: string,
    request?: Request | HttpClientClientErrorOptions,
    cause?: unknown,
    options?: HttpClientClientErrorOptions,
  ) {
    const opts = resolveClientErrorArguments(request, cause, options);
    super(message, {
      ...opts,
      code: opts.code ?? ErrorCode.HTTP_CLIENT_NETWORK,
      statusCode: opts.statusCode ?? 502,
      metadata: {
        ...opts.metadata,
        ...describeSystemError(opts.cause),
      },
    });
  }
}

/** Extracts diagnostic fields (errno/syscall/address/port) from a Node system error. */
function describeSystemError(cause: unknown): Record<string, string | number> {
  if (cause === null || typeof cause !== "object") return {};
  const record = cause as Record<string, unknown>;
  const result: Record<string, string | number> = {};
  for (const key of ["code", "errno", "syscall", "address", "port"]) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") {
      result[key === "code" ? "systemCode" : key] = value;
    }
  }
  return result;
}
