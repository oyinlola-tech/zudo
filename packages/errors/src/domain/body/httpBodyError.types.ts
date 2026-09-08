import { ErrorCode } from "../../base/types/errorCode.type.js";
import { HttpBodyError } from "./httpBodyError.base.js";

/**
 * Error thrown when the request body exceeds the configured size limit.
 */
export class HttpBodyLimitError extends HttpBodyError {
  /** The configured size limit in bytes. */
  public readonly limit: number;

  /** The actual size of the request body in bytes. */
  public readonly received: number;

  constructor(limit: number, received: number) {
    super("Request body exceeds the configured size limit.", {
      code: ErrorCode.HTTP_BODY_LIMIT,
      statusCode: 413,
      metadata: { limit, received },
    });
    this.limit = limit;
    this.received = received;
  }
}

/**
 * Error thrown when a request body read is aborted.
 */
export class HttpBodyAbortedError extends HttpBodyError {
  constructor() {
    super("Request body was aborted before it could be completely read.", {
      code: ErrorCode.HTTP_BODY_ABORTED,
      statusCode: 408,
    });
  }
}

/**
 * Error thrown when request body parsing fails.
 */
export class HttpBodyParseError extends HttpBodyError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: ErrorCode.HTTP_BODY_PARSE,
      cause,
    });
  }
}
