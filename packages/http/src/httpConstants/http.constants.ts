import { getStatusText } from "../httpStatus/httpStatus.lookup.js";

/* -------------------------------------------------------------------------- */
/* HTTP Methods                                                               */
/* -------------------------------------------------------------------------- */

export const HTTP_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "TRACE",
  "CONNECT",
  "QUERY",
] as const;

/* -------------------------------------------------------------------------- */
/* HTTP Status Codes                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Convenience map of the commonly used status codes.
 *
 * @remarks
 * This is a **partial** table. `src/httpStatus` carries the complete RFC 9110
 * set; prefer `STATUS` / `STATUS_CODES` from there for anything beyond the
 * codes listed below.
 */
export const HTTP_STATUS = Object.freeze({
  CONTINUE: 100,
  SWITCHING_PROTOCOLS: 101,
  PROCESSING: 102,

  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NON_AUTHORITATIVE_INFORMATION: 203,
  NO_CONTENT: 204,
  RESET_CONTENT: 205,
  PARTIAL_CONTENT: 206,

  MULTIPLE_CHOICES: 300,
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  SEE_OTHER: 303,
  NOT_MODIFIED: 304,
  TEMPORARY_REDIRECT: 307,
  PERMANENT_REDIRECT: 308,

  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  PROXY_AUTHENTICATION_REQUIRED: 407,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  LENGTH_REQUIRED: 411,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  URI_TOO_LONG: 414,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RANGE_NOT_SATISFIABLE: 416,
  EXPECTATION_FAILED: 417,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,

  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  HTTP_VERSION_NOT_SUPPORTED: 505,
} as const);

/* -------------------------------------------------------------------------- */
/* Default Values                                                             */
/* -------------------------------------------------------------------------- */

export const HTTP_DEFAULTS = {
  HOST: "0.0.0.0",
  PORT: 3000,

  KEEP_ALIVE_TIMEOUT: 5_000,
  REQUEST_TIMEOUT: 300_000,
  HEADERS_TIMEOUT: 60_000,

  MAX_REQUESTS_PER_SOCKET: 0,

  BODY_LIMIT: 1_048_576,
  JSON_CONTENT_TYPE: "application/json",
  TEXT_CONTENT_TYPE: "text/plain; charset=utf-8",
  HTML_CONTENT_TYPE: "text/html; charset=utf-8",

  USER_AGENT: "Zudojs-HTTP",
} as const;

/* -------------------------------------------------------------------------- */
/* Header Names                                                               */
/* -------------------------------------------------------------------------- */

export const HTTP_HEADERS = {
  ACCEPT: "accept",
  ACCEPT_CHARSET: "accept-charset",
  ACCEPT_ENCODING: "accept-encoding",
  ACCEPT_LANGUAGE: "accept-language",

  AUTHORIZATION: "authorization",

  CACHE_CONTROL: "cache-control",
  CONNECTION: "connection",
  CONTENT_DISPOSITION: "content-disposition",
  CONTENT_ENCODING: "content-encoding",
  CONTENT_LANGUAGE: "content-language",
  CONTENT_LENGTH: "content-length",
  CONTENT_TYPE: "content-type",

  COOKIE: "cookie",
  DATE: "date",
  ETAG: "etag",
  EXPECT: "expect",
  HOST: "host",
  IF_MATCH: "if-match",
  IF_MODIFIED_SINCE: "if-modified-since",
  IF_NONE_MATCH: "if-none-match",
  IF_UNMODIFIED_SINCE: "if-unmodified-since",
  LOCATION: "location",
  ORIGIN: "origin",
  REFERER: "referer",
  RETRY_AFTER: "retry-after",
  SET_COOKIE: "set-cookie",
  TRANSFER_ENCODING: "transfer-encoding",
  USER_AGENT: "user-agent",
  VARY: "vary",
  WWW_AUTHENTICATE: "www-authenticate",
  X_FORWARDED_FOR: "x-forwarded-for",
  X_FORWARDED_HOST: "x-forwarded-host",
  X_FORWARDED_PROTO: "x-forwarded-proto",
  X_REQUEST_ID: "x-request-id",
  ACCEPT_QUERY: "accept-query",
} as const;

/* -------------------------------------------------------------------------- */
/* Content Types                                                              */
/* -------------------------------------------------------------------------- */

export const HTTP_CONTENT_TYPES = {
  JSON: "application/json",
  JSON_UTF8: "application/json; charset=utf-8",
  TEXT: "text/plain",
  TEXT_UTF8: "text/plain; charset=utf-8",
  HTML: "text/html",
  HTML_UTF8: "text/html; charset=utf-8",
  FORM: "application/x-www-form-urlencoded",
  MULTIPART: "multipart/form-data",
  OCTET_STREAM: "application/octet-stream",
} as const;

/* -------------------------------------------------------------------------- */
/* Request Methods                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Methods RFC 9110 section 9.2.1 defines as safe.
 */
export const HTTP_SAFE_METHODS = [
  "GET",
  "HEAD",
  "OPTIONS",
  "TRACE",
  "QUERY",
] as const;

export const HTTP_IDEMPOTENT_METHODS = [
  "GET",
  "HEAD",
  "PUT",
  "DELETE",
  "OPTIONS",
  "TRACE",
  "QUERY",
] as const;

/* -------------------------------------------------------------------------- */
/* CORS Defaults                                                              */
/* -------------------------------------------------------------------------- */

export const HTTP_CORS_DEFAULTS = {
  ORIGIN: "*",

  METHODS: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  ALLOWED_HEADERS: [
    "Accept",
    "Authorization",
    "Content-Type",
    "Origin",
    "X-Requested-With",
  ],

  EXPOSED_HEADERS: [],

  CREDENTIALS: false,

  MAX_AGE: 86_400,
} as const;

/* -------------------------------------------------------------------------- */
/* Cookie Defaults                                                            */
/* -------------------------------------------------------------------------- */

export const HTTP_COOKIE_DEFAULTS = {
  PATH: "/",
  SAME_SITE: "lax",
  HTTP_ONLY: true,
  SECURE: false,
} as const;

/* -------------------------------------------------------------------------- */
/* HTTP Error Codes                                                           */
/* -------------------------------------------------------------------------- */

export const HTTP_ERROR_CODES = {
  BAD_REQUEST: "HTTP_BAD_REQUEST",
  UNAUTHORIZED: "HTTP_UNAUTHORIZED",
  FORBIDDEN: "HTTP_FORBIDDEN",
  NOT_FOUND: "HTTP_NOT_FOUND",
  METHOD_NOT_ALLOWED: "HTTP_METHOD_NOT_ALLOWED",
  NOT_ACCEPTABLE: "HTTP_NOT_ACCEPTABLE",
  CONFLICT: "HTTP_CONFLICT",
  UNPROCESSABLE_ENTITY: "HTTP_UNPROCESSABLE_ENTITY",
  TOO_MANY_REQUESTS: "HTTP_TOO_MANY_REQUESTS",

  INTERNAL_SERVER_ERROR: "HTTP_INTERNAL_SERVER_ERROR",
  NOT_IMPLEMENTED: "HTTP_NOT_IMPLEMENTED",
  BAD_GATEWAY: "HTTP_BAD_GATEWAY",
  SERVICE_UNAVAILABLE: "HTTP_SERVICE_UNAVAILABLE",
  GATEWAY_TIMEOUT: "HTTP_GATEWAY_TIMEOUT",

  REQUEST_ABORTED: "HTTP_REQUEST_ABORTED",
  REQUEST_TIMEOUT: "HTTP_REQUEST_TIMEOUT",
  PAYLOAD_TOO_LARGE: "HTTP_PAYLOAD_TOO_LARGE",
  INVALID_JSON: "HTTP_INVALID_JSON",
  INVALID_CONTENT_TYPE: "HTTP_INVALID_CONTENT_TYPE",
} as const;

/* -------------------------------------------------------------------------- */
/* Route Tokens                                                               */
/* -------------------------------------------------------------------------- */

export const HTTP_ROUTE_TOKENS = {
  PARAMETER_PREFIX: ":",
  WILDCARD: "*",
  OPTIONAL_PARAMETER: "?",
  PATH_SEPARATOR: "/",
} as const;

/* -------------------------------------------------------------------------- */
/* Protocol                                                                   */
/* -------------------------------------------------------------------------- */

export const HTTP_PROTOCOLS = {
  HTTP_1_0: "http/1.0",
  HTTP_1_1: "http/1.1",
  HTTP_2: "h2",
  HTTPS: "https",
} as const;

/* -------------------------------------------------------------------------- */
/* Server Events                                                              */
/* -------------------------------------------------------------------------- */

export const HTTP_SERVER_EVENTS = {
  LISTENING: "listening",
  CONNECTION: "connection",
  REQUEST: "request",
  ERROR: "error",
  CLOSE: "close",
} as const;

/* -------------------------------------------------------------------------- */
/* Response Messages                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Reason phrases for the commonly used status codes.
 *
 * @remarks
 * **Partial.** Read it through {@link getHTTPStatusMessage}, which delegates
 * to `httpStatus`'s complete table; indexing this record directly yields
 * `undefined` for codes such as 451.
 */
export const HTTP_STATUS_MESSAGES: Readonly<Record<number, string>> =
  Object.freeze({
    100: "Continue",
    101: "Switching Protocols",
    102: "Processing",

    200: "OK",
    201: "Created",
    202: "Accepted",
    203: "Non-Authoritative Information",
    204: "No Content",
    205: "Reset Content",
    206: "Partial Content",

    300: "Multiple Choices",
    301: "Moved Permanently",
    302: "Found",
    303: "See Other",
    304: "Not Modified",
    307: "Temporary Redirect",
    308: "Permanent Redirect",

    400: "Bad Request",
    401: "Unauthorized",
    402: "Payment Required",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    406: "Not Acceptable",
    407: "Proxy Authentication Required",
    408: "Request Timeout",
    409: "Conflict",
    410: "Gone",
    411: "Length Required",
    412: "Precondition Failed",
    413: "Payload Too Large",
    414: "URI Too Long",
    415: "Unsupported Media Type",
    416: "Range Not Satisfiable",
    417: "Expectation Failed",
    422: "Unprocessable Entity",
    429: "Too Many Requests",

    500: "Internal Server Error",
    501: "Not Implemented",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
    505: "HTTP Version Not Supported",
  });

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function isHTTPMethod(method: string): boolean {
  return HTTP_METHODS.includes(
    method.toUpperCase() as (typeof HTTP_METHODS)[number],
  );
}

export function isSafeHTTPMethod(method: string): boolean {
  return HTTP_SAFE_METHODS.includes(
    method.toUpperCase() as (typeof HTTP_SAFE_METHODS)[number],
  );
}

export function isIdempotentHTTPMethod(method: string): boolean {
  return HTTP_IDEMPOTENT_METHODS.includes(
    method.toUpperCase() as (typeof HTTP_IDEMPOTENT_METHODS)[number],
  );
}

/**
 * Returns the reason phrase for a status code.
 *
 * Delegates to `httpStatus`, which carries the complete RFC 9110 table.
 * {@link HTTP_STATUS_MESSAGES} covers only the common codes, so reading it
 * directly emitted `HTTP/1.1 451 Unknown Status` on the wire.
 *
 * @param statusCode - The status code.
 * @returns The reason phrase, or `"Unknown Status"`.
 */
export function getHTTPStatusMessage(statusCode: number): string {
  return getStatusText(statusCode);
}

/**
 * Reports whether a status code is an error status.
 *
 * @param statusCode - The status code.
 * @returns `true` for 4xx and 5xx only; `999` and `Infinity` are not statuses.
 */
export function isHTTPErrorStatus(statusCode: number): boolean {
  return statusCode >= 400 && statusCode < 600;
}

export function isHTTPSuccessStatus(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

export function isHTTPRedirectStatus(statusCode: number): boolean {
  return statusCode >= 300 && statusCode < 400;
}
