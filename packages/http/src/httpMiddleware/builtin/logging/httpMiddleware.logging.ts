/**
 * Logging middleware factory.
 *
 * @module httpMiddleware/builtin/logging
 */

import { createSecretMatcher, redactLogValue } from "@zudojs/logger";

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

  /**
   * Extra header names whose value must be replaced with `[REDACTED]`, on top
   * of the credential-bearing names `@zudojs/logger` already recognises
   * (`authorization`, `proxy-authorization`, `cookie`, `set-cookie`, …).
   */
  readonly redactHeaders?: readonly string[];
}

/**
 * Creates the request/response logging middleware.
 *
 * With `includeHeaders` the header record is redacted before it reaches the
 * logger, using the same matcher `@zudojs/logger` applies to log metadata.
 * It used to be copied verbatim, so a bearer token and the whole session
 * cookie landed in the log store on every request.
 *
 * @param options - Logger, header inclusion and extra redacted names.
 * @returns A middleware that logs the start, completion and failure of a
 *   request.
 */
export function createLoggingMiddleware(
  options: LoggingMiddlewareOptions = {},
): HttpMiddleware {
  const isSecret = createSecretMatcher({
    keys: options.redactHeaders ? [...options.redactHeaders] : undefined,
  });

  return async (context, next) => {
    const startedAt = Date.now();

    const request = context.request;

    const logger = options.logger;

    logger?.info?.("HTTP request started.", {
      method: getRequestMethod(request),
      url: getRequestUrl(request),
      ...(options.includeHeaders
        ? {
            headers: redactLogValue(getRequestHeaders(request), isSecret),
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
