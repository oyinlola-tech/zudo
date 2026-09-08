/**
 * @zudojs/http — Request guard middleware.
 *
 * Validates incoming requests against security constraints at the
 * first security boundary. Rejects malformed, oversized, or
 * suspicious requests before they reach the router.
 */

import type { HTTPSecurityConfig } from "./httpSecurity.config.js";
import {
  validateHeaders,
  validateHost,
  validateUrl,
  validateQuery,
  validateContentLength,
  validateRequestId,
  validateTransferEncoding,
} from "./httpSecurity.validator.js";

/** A request-like object for validation (keeps the guard decoupled from HTTP types). */
export interface GuardableRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string | string[] | undefined>;
}

/** Result of the request guard check. */
export interface GuardResult {
  readonly allowed: boolean;
  readonly errors: readonly string[];
  readonly statusCode: number;
}

/**
 * Run all security validations against an incoming request.
 *
 * @param request - The incoming request to validate.
 * @param config - Security configuration.
 * @returns A GuardResult indicating whether the request is allowed.
 */
export function guardRequest(
  request: GuardableRequest,
  config?: Partial<HTTPSecurityConfig>,
): GuardResult {
  const allErrors: string[] = [];

  const urlParts = request.url.split("?");
  const path = urlParts[0] ?? request.url;
  const query = urlParts[1] ?? "";

  const headerResult = validateHeaders(request.headers, config);
  allErrors.push(...headerResult.errors);

  const hostResult = validateHost(
    request.headers.host as string | undefined,
    config,
  );
  allErrors.push(...hostResult.errors);

  const urlResult = validateUrl(path, config);
  allErrors.push(...urlResult.errors);

  const queryResult = validateQuery(query, config);
  allErrors.push(...queryResult.errors);

  const contentLengthResult = validateContentLength(
    request.headers["content-length"] as string | undefined,
    config,
  );
  allErrors.push(...contentLengthResult.errors);

  const requestIdResult = validateRequestId(
    request.headers["x-request-id"] as string | undefined,
    config,
  );
  allErrors.push(...requestIdResult.errors);

  const transferEncodingResult = validateTransferEncoding(
    request.headers["transfer-encoding"] as string | undefined,
    request.headers["content-length"] as string | undefined,
    config,
  );
  allErrors.push(...transferEncodingResult.errors);

  if (allErrors.length > 0) {
    return { allowed: false, errors: allErrors, statusCode: 400 };
  }

  return { allowed: true, errors: [], statusCode: 200 };
}

/**
 * Binds a configuration to {@link guardRequest} so a server or adapter can
 * hold a single ready-to-call guard.
 *
 * `guardRequest` describes itself as "the first security boundary" and had no
 * call site anywhere in `src/`, which left the header-count limit, URL-length
 * limit, Host validation, request-ID validation and the
 * `Transfer-Encoding`/`Content-Length` smuggling check all inert. This is the
 * shape the request path should call; see `assertRequestAllowed` for the
 * throwing variant.
 */
export function createRequestGuard(
  config?: Partial<HTTPSecurityConfig>,
): (request: GuardableRequest) => GuardResult {
  return (request) => guardRequest(request, config);
}

/**
 * Error thrown by {@link assertRequestAllowed}.
 *
 * Carries the status the response should use and the individual validation
 * failures, so a caller can log the detail without returning it to the client.
 */
export class HttpRequestGuardError extends Error {
  readonly statusCode: number;

  readonly errors: readonly string[];

  constructor(result: GuardResult) {
    super(`Request rejected by security guard: ${result.errors.join("; ")}`);

    this.name = "HttpRequestGuardError";
    this.statusCode = result.statusCode;
    this.errors = result.errors;
  }
}

/**
 * Runs the guard and throws {@link HttpRequestGuardError} when the request is
 * rejected.
 */
export function assertRequestAllowed(
  request: GuardableRequest,
  config?: Partial<HTTPSecurityConfig>,
): void {
  const result = guardRequest(request, config);

  if (!result.allowed) {
    throw new HttpRequestGuardError(result);
  }
}
