/**
 * Rate limiting middleware built on `@zudojs/security`.
 *
 * AGENTS.md requires public endpoints to be rate limited with
 * `createRateLimiter` from `@zudojs/security`, and `@zudojs/http` offered no
 * way to do that. This wraps the shared limiter; it does not re-implement it.
 *
 * The client key is `request.remoteAddress`, which the Node adapter has
 * already resolved through its `trustProxy` setting, so forwarded headers
 * only count when the adapter trusts the peer that sent them.
 *
 * @module httpMiddleware/builtin/rateLimit
 */

import {
  createRateLimiter,
  type RateLimiterOptions,
  type RateLimitRequest,
  type RateLimitResponse,
} from "@zudojs/security";

import type { HttpMiddleware } from "../../httpMiddleware.type.js";

import { createResponseContext } from "../../../httpResponse/httpResponse.context.js";

/**
 * The limiter instance returned by `@zudojs/security`'s `createRateLimiter`.
 */
export type HttpRateLimiter = ReturnType<typeof createRateLimiter>;

/**
 * Options for {@link createRateLimitMiddleware}: either the
 * `@zudojs/security` limiter options, or an existing `limiter` to share
 * between routes.
 */
export type RateLimitMiddlewareOptions =
  | RateLimiterOptions
  | { readonly limiter: HttpRateLimiter };

/**
 * Creates middleware that answers `429 Too Many Requests` (with
 * `Retry-After`, from the `@zudojs/security` handler) once a client exceeds
 * its allowance, and otherwise passes the request on.
 */
export function createRateLimitMiddleware(
  options: RateLimitMiddlewareOptions,
): HttpMiddleware {
  const limiter =
    "limiter" in options ? options.limiter : createRateLimiter(options);

  return async (context, next) => {
    const request = context.request;

    const limitRequest: RateLimitRequest = {
      ip: request.remoteAddress,
      method: request.method,
      path: request.path,
      headers: request.headers,
    };

    const rejection: RateLimitResponse = { statusCode: 429, headers: {} };

    if (limiter.middleware(limitRequest, rejection).allowed) {
      return next();
    }

    const response = createResponseContext().setStatus(rejection.statusCode);

    for (const [name, value] of Object.entries(rejection.headers)) {
      response.setHeader(name.toLowerCase(), value);
    }

    return response.setBody(rejection.body ?? "Too Many Requests");
  };
}
