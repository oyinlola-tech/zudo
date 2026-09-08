/**
 * @zudojs/http
 *
 * HTTP primitives, request handling, routing, middleware, and server infrastructure.
 *
 * Note: Some sub-modules re-export shared symbols from other sub-modules.
 * TypeScript reports TS2308 (ambiguous re-exports) for these duplicates.
 * This is intentional — consumers can import from either path.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export * from "./httpProtocol/index.js";
export * from "./httpTypes/index.js";
export * from "./httpConstants/index.js";
export * from "./httpStatus/index.js";
export * from "./httpErrors/index.js";
export * from "./httpMethods/index.js";
export * from "./httpHeaders/index.js";
export * from "./httpRequest/index.js";
export * from "./httpResponse/index.js";
export * from "./httpBody/index.js";
export * from "./httpCookies/index.js";
export * from "./httpQuery/index.js";
export * from "./httpUrl/index.js";
export * from "./httpMiddleware/index.js";
export * from "./httpInterceptors/index.js";
export * from "./httpContext/index.js";
export * from "./httpServer/index.js";
export * from "./httpAdapter/index.js";
export * from "./httpClient/index.js";
export * from "./httpCsp/index.js";
export * from "./httpHsts/index.js";
export * from "./httpSecurityHeaders/index.js";
export * from "./httpTrustProxy/index.js";
export * from "./httpCors/index.js";
export * from "./httpContentType/index.js";
export * from "./httpContentDisposition/index.js";
export * from "./httpNegotiation/index.js";
export * from "./httpMime/index.js";
export * from "./httpRange/index.js";
export * from "./httpConditional/index.js";
export * from "./httpRedirect/index.js";
export * from "./httpValidation/index.js";
export * from "./httpFormData/index.js";
export * from "./httpMultipart/index.js";
export * from "./httpStream/index.js";
export * from "./httpCompression/index.js";
export * from "./httpCacheControl/index.js";
export * from "./httpKeepAlive/index.js";
export * from "./httpAgent/index.js";
export * from "./httpProxy/index.js";
export * from "./httpSecurity/index.js";
export * from "./httpRouter/index.js";

/* -------------------------------------------------------------------------- */
/* Ambiguous re-exports                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Several sub-modules export the same name. A star export alone would make
 * those names unavailable (TS2308), so ownership is declared explicitly here.
 *
 * The rule is declaration order: the sub-module listed first in this file owns
 * the name. The other definitions remain reachable from their own sub-module.
 */

export { validatePort, validateTimeout } from "./httpAdapter/index.js";

export {
  isMultipartContentType,
  parseMultipartBody,
  sanitizeFilename,
} from "./httpBody/index.js";

export { isFresh } from "./httpConditional/index.js";

export { isHTTPMethod } from "./httpConstants/index.js";

export {
  getParameter,
  hasParameter,
  withCharset,
} from "./httpContentType/index.js";

export { normalizeMethods } from "./httpCors/index.js";

export {
  badRequest,
  conflict,
  forbidden,
  internalServerError,
  methodNotAllowed,
  normalizeHeaders,
  notFound,
  notImplemented,
  serviceUnavailable,
  tooManyRequests,
  unauthorized,
  unprocessableEntity,
} from "./httpErrors/index.js";

export { extractSequence } from "./httpInterceptors/index.js";

export {
  hasRequestBody,
  normalizeHTTPMethod,
  normalizeMethod,
} from "./httpMethods/index.js";

export {
  getRequestMethod,
  getRequestUrl,
  isResponseContext,
  normalizePriority,
  sanitizeName,
} from "./httpMiddleware/index.js";

export {
  getHeader,
  hasConnectionToken,
  isErrorStatus,
  shouldKeepAlive,
} from "./httpProtocol/index.js";

export { getQuery, parseQuery } from "./httpQuery/index.js";

export type { QueryValue } from "./httpQuery/index.js";

export { isSameOrigin } from "./httpRedirect/index.js";

export {
  getHostname,
  getPathname,
  getRequestProtocol,
  getSearchParams,
  isRequestContext,
  parseAcceptHeader,
  parseQueryString,
} from "./httpRequest/index.js";

export type { HttpMethod } from "./httpRequest/index.js";

export { redirect } from "./httpResponse/index.js";

export type { CookieOptions, CookiePriority } from "./httpResponse/index.js";

export {
  validateHeaderName,
  validateHeaderValue,
} from "./httpSecurityHeaders/index.js";

export {
  REDIRECT_STATUS_CODES,
  assertValidStatusCode,
  getStatusText,
  isClientError,
  isPermanentRedirect,
  isServerError,
  isTemporaryRedirect,
  isValidStatusCode,
} from "./httpStatus/index.js";

export type { ForwardedAddress, ProxyRequest } from "./httpTrustProxy/index.js";

export { HTTP_METHODS } from "./httpTypes/index.js";

export type {
  HTTPHeaders,
  HTTPHeadersInit,
  HTTPMethod,
  HTTPStatusCode,
} from "./httpTypes/index.js";

export { normalizePath } from "./httpUrl/index.js";

export { validateContentLength } from "./httpValidation/index.js";
