/**
 * Standard HTTP header name constants.
 *
 * @module http/httpHeader
 */

/**
 * Common HTTP header names.
 */
export const HttpHeader = Object.freeze({
  ACCEPT: "Accept",
  ACCEPT_CHARSET: "Accept-Charset",
  ACCEPT_ENCODING: "Accept-Encoding",
  ACCEPT_LANGUAGE: "Accept-Language",
  AUTHORIZATION: "Authorization",
  CACHE_CONTROL: "Cache-Control",
  CONTENT_DISPOSITION: "Content-Disposition",
  CONTENT_ENCODING: "Content-Encoding",
  CONTENT_LENGTH: "Content-Length",
  CONTENT_TYPE: "Content-Type",
  COOKIE: "Cookie",
  DNT: "DNT",
  HOST: "Host",
  IF_MODIFIED_SINCE: "If-Modified-Since",
  IF_NONE_MATCH: "If-None-Match",
  ORIGIN: "Origin",
  PRAGMA: "Pragma",
  RANGE: "Range",
  REFERER: "Referer",
  RETRY_AFTER: "Retry-After",
  SERVER: "Server",
  SET_COOKIE: "Set-Cookie",
  USER_AGENT: "User-Agent",
  X_FORWARDED_FOR: "X-Forwarded-For",
  X_FORWARDED_HOST: "X-Forwarded-Host",
  X_FORWARDED_PROTO: "X-Forwarded-Proto",
  X_REQUEST_ID: "X-Request-Id",
  X_API_KEY: "X-Api-Key",
  X_CORRELATION_ID: "X-Correlation-Id",
} as const);

/** Type-safe HTTP header name — the union of all {@link HttpHeader} values. */
export type HttpHeaderName = (typeof HttpHeader)[keyof typeof HttpHeader];

/**
 * Any HTTP header name — use when handling headers outside the
 * {@link HttpHeader} catalogue (still autocompletes the known names).
 */
export type AnyHttpHeaderName = HttpHeaderName | (string & {});
