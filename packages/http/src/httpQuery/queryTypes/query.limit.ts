import { HttpError } from "@zudojs/errors";

import type { QueryLimitOptions } from "./query.type.js";

export const DEFAULT_QUERY_MAX_KEYS = 1000;

export const DEFAULT_QUERY_MAX_KEY_LENGTH = 4096;

export const DEFAULT_QUERY_MAX_VALUE_LENGTH = 16384;

export const DEFAULT_QUERY_MAX_TOTAL_LENGTH = 1024 * 1024;

export const DEFAULT_QUERY_MAX_DEPTH = 10;

/**
 * Thrown when a query string exceeds one of the parser's limits.
 *
 * Carries `statusCode: 414` so an error handler can answer with
 * `414 URI Too Long` rather than treating the rejection as an internal fault.
 */
export class HTTPQueryLimitError extends HttpError {
  public constructor(message: string) {
    super(message, {
      statusCode: 414,
      code: "HTTP_QUERY_LIMIT",
      expose: true,
      isOperational: true,
    });

    this.name = "HTTPQueryLimitError";
  }
}

/** Resolved form of {@link QueryLimitOptions}, with every default applied. */
export interface QueryLimits {
  readonly maxKeys: number;
  readonly maxKeyLength: number;
  readonly maxValueLength: number;
  readonly maxTotalLength: number;
}

export function resolveLimits(options: QueryLimitOptions): QueryLimits {
  return {
    maxKeys: options.maxKeys ?? DEFAULT_QUERY_MAX_KEYS,
    maxKeyLength: options.maxKeyLength ?? DEFAULT_QUERY_MAX_KEY_LENGTH,
    maxValueLength: options.maxValueLength ?? DEFAULT_QUERY_MAX_VALUE_LENGTH,
    maxTotalLength: options.maxTotalLength ?? DEFAULT_QUERY_MAX_TOTAL_LENGTH,
  };
}
