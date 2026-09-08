/**
 * Standard HTTP status code definitions.
 *
 * Kept separate from status.ts so consumers that only need numeric
 * constants do not have to depend on the status helper implementations.
 */

/* -------------------------------------------------------------------------- */
/* 1xx Informational                                                          */
/* -------------------------------------------------------------------------- */

export const CONTINUE = 100 as const;
export const SWITCHING_PROTOCOLS = 101 as const;
export const PROCESSING = 102 as const;
export const EARLY_HINTS = 103 as const;

/* -------------------------------------------------------------------------- */
/* 2xx Success                                                                */
/* -------------------------------------------------------------------------- */

export const OK = 200 as const;
export const CREATED = 201 as const;
export const ACCEPTED = 202 as const;
export const NON_AUTHORITATIVE_INFORMATION = 203 as const;
export const NO_CONTENT = 204 as const;
export const RESET_CONTENT = 205 as const;
export const PARTIAL_CONTENT = 206 as const;
export const MULTI_STATUS = 207 as const;
export const ALREADY_REPORTED = 208 as const;
export const IM_USED = 226 as const;

/* -------------------------------------------------------------------------- */
/* 3xx Redirection                                                            */
/* -------------------------------------------------------------------------- */

export const MULTIPLE_CHOICES = 300 as const;
export const MOVED_PERMANENTLY = 301 as const;
export const FOUND = 302 as const;
export const SEE_OTHER = 303 as const;
export const NOT_MODIFIED = 304 as const;
export const USE_PROXY = 305 as const;
export const TEMPORARY_REDIRECT = 307 as const;
export const PERMANENT_REDIRECT = 308 as const;

/* -------------------------------------------------------------------------- */
/* 4xx Client Errors                                                          */
/* -------------------------------------------------------------------------- */

export const BAD_REQUEST = 400 as const;
export const UNAUTHORIZED = 401 as const;
export const PAYMENT_REQUIRED = 402 as const;
export const FORBIDDEN = 403 as const;
export const NOT_FOUND = 404 as const;
export const METHOD_NOT_ALLOWED = 405 as const;
export const NOT_ACCEPTABLE = 406 as const;
export const PROXY_AUTHENTICATION_REQUIRED = 407 as const;
export const REQUEST_TIMEOUT = 408 as const;
export const CONFLICT = 409 as const;
export const GONE = 410 as const;
export const LENGTH_REQUIRED = 411 as const;
export const PRECONDITION_FAILED = 412 as const;

/**
 * RFC 9110 renamed 413 from "Payload Too Large" to
 * "Content Too Large". The numeric code remains 413.
 */
export const CONTENT_TOO_LARGE = 413 as const;

/**
 * Backwards-compatible alias.
 */
export const PAYLOAD_TOO_LARGE = CONTENT_TOO_LARGE;

export const URI_TOO_LONG = 414 as const;
export const UNSUPPORTED_MEDIA_TYPE = 415 as const;
export const RANGE_NOT_SATISFIABLE = 416 as const;
export const EXPECTATION_FAILED = 417 as const;
export const IM_A_TEAPOT = 418 as const;
export const MISDIRECTED_REQUEST = 421 as const;

/**
 * RFC 9110 renamed 422 from "Unprocessable Entity" to
 * "Unprocessable Content".
 */
export const UNPROCESSABLE_CONTENT = 422 as const;

/**
 * Backwards-compatible alias.
 */
export const UNPROCESSABLE_ENTITY = UNPROCESSABLE_CONTENT;

export const LOCKED = 423 as const;
export const FAILED_DEPENDENCY = 424 as const;
export const TOO_EARLY = 425 as const;
export const UPGRADE_REQUIRED = 426 as const;
export const PRECONDITION_REQUIRED = 428 as const;
export const TOO_MANY_REQUESTS = 429 as const;
export const REQUEST_HEADER_FIELDS_TOO_LARGE = 431 as const;
export const UNAVAILABLE_FOR_LEGAL_REASONS = 451 as const;

/* -------------------------------------------------------------------------- */
/* 5xx Server Errors                                                          */
/* -------------------------------------------------------------------------- */

export const INTERNAL_SERVER_ERROR = 500 as const;
export const NOT_IMPLEMENTED = 501 as const;
export const BAD_GATEWAY = 502 as const;
export const SERVICE_UNAVAILABLE = 503 as const;
export const GATEWAY_TIMEOUT = 504 as const;
export const HTTP_VERSION_NOT_SUPPORTED = 505 as const;
export const VARIANT_ALSO_NEGOTIATES = 506 as const;
export const INSUFFICIENT_STORAGE = 507 as const;
export const LOOP_DETECTED = 508 as const;
export const NOT_EXTENDED = 510 as const;
export const NETWORK_AUTHENTICATION_REQUIRED = 511 as const;

/* -------------------------------------------------------------------------- */
/* Grouped Constants                                                          */
/* -------------------------------------------------------------------------- */

export const INFORMATIONAL_STATUS_CODES = {
  CONTINUE,
  SWITCHING_PROTOCOLS,
  PROCESSING,
  EARLY_HINTS,
} as const;

export const SUCCESS_STATUS_CODES = {
  OK,
  CREATED,
  ACCEPTED,
  NON_AUTHORITATIVE_INFORMATION,
  NO_CONTENT,
  RESET_CONTENT,
  PARTIAL_CONTENT,
  MULTI_STATUS,
  ALREADY_REPORTED,
  IM_USED,
} as const;

export const REDIRECTION_STATUS_CODES = {
  MULTIPLE_CHOICES,
  MOVED_PERMANENTLY,
  FOUND,
  SEE_OTHER,
  NOT_MODIFIED,
  USE_PROXY,
  TEMPORARY_REDIRECT,
  PERMANENT_REDIRECT,
} as const;

export const CLIENT_ERROR_STATUS_CODES = {
  BAD_REQUEST,
  UNAUTHORIZED,
  PAYMENT_REQUIRED,
  FORBIDDEN,
  NOT_FOUND,
  METHOD_NOT_ALLOWED,
  NOT_ACCEPTABLE,
  PROXY_AUTHENTICATION_REQUIRED,
  REQUEST_TIMEOUT,
  CONFLICT,
  GONE,
  LENGTH_REQUIRED,
  PRECONDITION_FAILED,
  CONTENT_TOO_LARGE,
  URI_TOO_LONG,
  UNSUPPORTED_MEDIA_TYPE,
  RANGE_NOT_SATISFIABLE,
  EXPECTATION_FAILED,
  IM_A_TEAPOT,
  MISDIRECTED_REQUEST,
  UNPROCESSABLE_CONTENT,
  LOCKED,
  FAILED_DEPENDENCY,
  TOO_EARLY,
  UPGRADE_REQUIRED,
  PRECONDITION_REQUIRED,
  TOO_MANY_REQUESTS,
  REQUEST_HEADER_FIELDS_TOO_LARGE,
  UNAVAILABLE_FOR_LEGAL_REASONS,
} as const;

export const SERVER_ERROR_STATUS_CODES = {
  INTERNAL_SERVER_ERROR,
  NOT_IMPLEMENTED,
  BAD_GATEWAY,
  SERVICE_UNAVAILABLE,
  GATEWAY_TIMEOUT,
  HTTP_VERSION_NOT_SUPPORTED,
  VARIANT_ALSO_NEGOTIATES,
  INSUFFICIENT_STORAGE,
  LOOP_DETECTED,
  NOT_EXTENDED,
  NETWORK_AUTHENTICATION_REQUIRED,
} as const;

/* -------------------------------------------------------------------------- */
/* Complete Status Map                                                        */
/* -------------------------------------------------------------------------- */

export const STATUS_CODES = {
  ...INFORMATIONAL_STATUS_CODES,
  ...SUCCESS_STATUS_CODES,
  ...REDIRECTION_STATUS_CODES,
  ...CLIENT_ERROR_STATUS_CODES,
  ...SERVER_ERROR_STATUS_CODES,
} as const;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type InformationalStatusCode =
  (typeof INFORMATIONAL_STATUS_CODES)[keyof typeof INFORMATIONAL_STATUS_CODES];

export type SuccessStatusCode =
  (typeof SUCCESS_STATUS_CODES)[keyof typeof SUCCESS_STATUS_CODES];

export type RedirectionStatusCode =
  (typeof REDIRECTION_STATUS_CODES)[keyof typeof REDIRECTION_STATUS_CODES];

export type ClientErrorStatusCode =
  (typeof CLIENT_ERROR_STATUS_CODES)[keyof typeof CLIENT_ERROR_STATUS_CODES];

export type ServerErrorStatusCode =
  (typeof SERVER_ERROR_STATUS_CODES)[keyof typeof SERVER_ERROR_STATUS_CODES];

export type HTTPStatusCode =
  | InformationalStatusCode
  | SuccessStatusCode
  | RedirectionStatusCode
  | ClientErrorStatusCode
  | ServerErrorStatusCode;

/* -------------------------------------------------------------------------- */
/* Lookup Helpers                                                             */
/* -------------------------------------------------------------------------- */

export function isKnownStatusCode(status: number): status is HTTPStatusCode {
  return Object.values(STATUS_CODES).includes(status as HTTPStatusCode);
}

export function isInformationalStatusCode(status: number): boolean {
  return status >= 100 && status < 200;
}

export function isSuccessStatusCode(status: number): boolean {
  return status >= 200 && status < 300;
}

export function isRedirectionStatusCode(status: number): boolean {
  return status >= 300 && status < 400;
}

export function isClientErrorStatusCode(status: number): boolean {
  return status >= 400 && status < 500;
}

export function isServerErrorStatusCode(status: number): boolean {
  return status >= 500 && status < 600;
}

/* -------------------------------------------------------------------------- */
/* Frequently Used Status Sets                                                */
/* -------------------------------------------------------------------------- */

export const EMPTY_BODY_STATUS_CODES = [NO_CONTENT, RESET_CONTENT] as const;

export const REDIRECT_STATUS_CODES = [
  MOVED_PERMANENTLY,
  FOUND,
  SEE_OTHER,
  TEMPORARY_REDIRECT,
  PERMANENT_REDIRECT,
] as const;

export const RETRYABLE_STATUS_CODES = [
  REQUEST_TIMEOUT,
  TOO_EARLY,
  TOO_MANY_REQUESTS,
  INTERNAL_SERVER_ERROR,
  BAD_GATEWAY,
  SERVICE_UNAVAILABLE,
  GATEWAY_TIMEOUT,
] as const;

/* -------------------------------------------------------------------------- */
/* Default Status                                                             */
/* -------------------------------------------------------------------------- */

export const DEFAULT_SUCCESS_STATUS = OK;

export const DEFAULT_CLIENT_ERROR_STATUS = BAD_REQUEST;

export const DEFAULT_SERVER_ERROR_STATUS = INTERNAL_SERVER_ERROR;
