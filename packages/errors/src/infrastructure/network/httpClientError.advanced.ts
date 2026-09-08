/**
 * Advanced HTTP client error classes (422+).
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { HttpError } from "./http.error.js";
import type { HttpClientErrorOptions } from "./httpClientError.options.js";

/** 422 Unprocessable Entity */
export class UnprocessableEntityError extends HttpError {
  constructor(
    message = "Unprocessable Entity",
    options: HttpClientErrorOptions = {},
  ) {
    super(message, {
      ...options,
      statusCode: 422,
      code: options.code ?? ErrorCode.HTTP_UNPROCESSABLE_ENTITY,
    });
  }
}

/** 423 Locked */
export class LockedError extends HttpError {
  constructor(message = "Locked", options: HttpClientErrorOptions = {}) {
    super(message, {
      ...options,
      statusCode: 423,
      code: options.code ?? ErrorCode.HTTP_LOCKED,
    });
  }
}

/** 424 Failed Dependency */
export class FailedDependencyError extends HttpError {
  constructor(
    message = "Failed Dependency",
    options: HttpClientErrorOptions = {},
  ) {
    super(message, {
      ...options,
      statusCode: 424,
      code: options.code ?? ErrorCode.HTTP_FAILED_DEPENDENCY,
    });
  }
}

/** 425 Too Early */
export class TooEarlyError extends HttpError {
  constructor(message = "Too Early", options: HttpClientErrorOptions = {}) {
    super(message, {
      ...options,
      statusCode: 425,
      code: options.code ?? ErrorCode.HTTP_TOO_EARLY,
    });
  }
}

/** 426 Upgrade Required */
export class UpgradeRequiredError extends HttpError {
  constructor(
    message = "Upgrade Required",
    options: HttpClientErrorOptions = {},
  ) {
    super(message, {
      ...options,
      statusCode: 426,
      code: options.code ?? ErrorCode.HTTP_UPGRADE_REQUIRED,
    });
  }
}

/** 428 Precondition Required */
export class PreconditionRequiredError extends HttpError {
  constructor(
    message = "Precondition Required",
    options: HttpClientErrorOptions = {},
  ) {
    super(message, {
      ...options,
      statusCode: 428,
      code: options.code ?? ErrorCode.HTTP_PRECONDITION_REQUIRED,
    });
  }
}

/** 429 Too Many Requests */
export class TooManyRequestsError extends HttpError {
  constructor(
    message = "Too Many Requests",
    options: HttpClientErrorOptions = {},
  ) {
    super(message, {
      ...options,
      statusCode: 429,
      code: options.code ?? ErrorCode.HTTP_TOO_MANY_REQUESTS,
    });
  }
}

/** 431 Request Header Fields Too Large */
export class RequestHeaderFieldsTooLargeError extends HttpError {
  constructor(
    message = "Request Header Fields Too Large",
    options: HttpClientErrorOptions = {},
  ) {
    super(message, {
      ...options,
      statusCode: 431,
      code: options.code ?? ErrorCode.HTTP_REQUEST_HEADER_FIELDS_TOO_LARGE,
    });
  }
}

/** 499 Request Aborted */
export class RequestAbortedError extends HttpError {
  constructor(
    message = "Request Aborted",
    options: HttpClientErrorOptions = {},
  ) {
    super(message, {
      ...options,
      statusCode: 499,
      code: options.code ?? ErrorCode.HTTP_REQUEST_ABORTED,
    });
  }
}
