/**
 * Logging middleware factory.
 *
 * @module httpMiddleware/builtin/logging
 */

import type { HttpMiddleware } from "../../httpMiddleware.type.js";

import {
  getRequestMethod,
  getRequestUrl,
  getRequestHeaders,
  getResponseStatus,
} from "../helpers/index.js";

export interface RequestLogger {
  info?: (
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
  ) => void;

  error?: (
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
  ) => void;
}

export interface LoggingMiddlewareOptions {
  readonly logger?: RequestLogger;

  readonly includeHeaders?: boolean;
}

export function createLoggingMiddleware(
  options: LoggingMiddlewareOptions = {},
): HttpMiddleware {
  return async (context, next) => {
    const startedAt = Date.now();

    const request = context.request;

    const logger = options.logger;

    logger?.info?.("HTTP request started.", {
      method: getRequestMethod(request),
      url: getRequestUrl(request),
      ...(options.includeHeaders
        ? {
            headers: getRequestHeaders(request),
          }
        : {}),
    });

    try {
      const response = await next();

      logger?.info?.("HTTP request completed.", {
        method: getRequestMethod(request),
        url: getRequestUrl(request),
        status: getResponseStatus(response),
        duration: Date.now() - startedAt,
      });

      return response;
    } catch (error) {
      logger?.error?.("HTTP request failed.", {
        method: getRequestMethod(request),
        url: getRequestUrl(request),
        duration: Date.now() - startedAt,
        error,
      });

      throw error;
    }
  };
}
