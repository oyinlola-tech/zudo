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
 * A request with no usable client address (a Unix-socket peer, a context
 * built without `remoteAddress`, a destroyed socket) is counted in one
 * shared bucket, {@link UNKNOWN_CLIENT_RATE_LIMIT_IP}. The `@zudojs/security`
 * default key generator refuses such a request with a `ConfigurationError`,
 * which would otherwise surface as a 500, and skipping the limiter for it
 * would give it unlimited requests.
 *
 * @module httpMiddleware/builtin/rateLimit
 */

import {
  createRateLimiter,
  parseClientIp,
  retryAfterSeconds,
  type RateLimiterOptions,
  type RateLimitRequest,
  type RateLimitResponse,
} from "@zudojs/security";

import type { HttpMiddleware } from "../../httpMiddleware.type.js";

import { createResponseContext } from "../../../httpResponse/httpResponse.context.js";

/**
 * The `ip` given to the limiter for a request whose `remoteAddress` is
 * missing or is not an IP address. `0.0.0.0` is never a real peer address,
 * so these requests share one bucket without colliding with a client.
 */
export const UNKNOWN_CLIENT_RATE_LIMIT_IP = "0.0.0.0";

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
 * Creates middleware that answers `429 Too Many Requests` once a client
 * exceeds its allowance, and otherwise passes the request on. The 429 has a
 * JSON body (`{"error":{"code":"RATE_LIMIT_EXCEEDED",...},"code":
 * "RATE_LIMIT_EXCEEDED","message":...}`) sent as `application/json`, and
 * always a `Retry-After` header (the
 * `@zudojs/security` handler's, or one computed from the limiter's reset
 * time when a custom handler leaves it out).
 */
export function createRateLimitMiddleware(
  options: RateLimitMiddlewareOptions,
): HttpMiddleware {
  const limiter =
    "limiter" in options ? options.limiter : createRateLimiter(options);

  return async (context, next) => {
    const request = context.request;

    const limitRequest: RateLimitRequest = {
      ip: clientIpOf(request.remoteAddress),
      method: request.method,
      path: request.path,
      headers: request.headers,
    };

    const rejection: RateLimitResponse = { statusCode: 429, headers: {} };

    const decision = limiter.middleware(limitRequest, rejection);

    if (decision.allowed) {
      return next();
    }

    const response = createResponseContext().setStatus(rejection.statusCode);

    for (const [name, value] of Object.entries(rejection.headers)) {
      response.setHeader(name.toLowerCase(), value);
    }

    if (response.headers["retry-after"] === undefined) {
      response.setHeader("retry-after", String(retryAfterSeconds(decision)));
    }

    const body = withTopLevelCode(rejection.body ?? DEFAULT_REJECTION_BODY);

    /*
     * The limiter's body is JSON, but it went out as a bare string, which the
     * writer labels `text/plain`. A handler's own content type is kept.
     */
    if (response.headers["content-type"] === undefined) {
      response.setHeader(
        "content-type",
        isJson(body) ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
      );
    }

    return response.setBody(body);
  };
}

/** Body sent when a custom limiter handler supplies none. */
const DEFAULT_REJECTION_BODY = JSON.stringify({
  error: { code: "RATE_LIMIT_EXCEEDED", message: "Too Many Requests" },
});

function isJson(body: string): boolean {
  try {
    JSON.parse(body);
    return true;
  } catch {
    return false;
  }
}

/**
 * Adds top-level `code` and `message` to a `{ error: { code, message } }`
 * body, so the 429 carries the same `code` field every other framework error
 * body has (`{ error: "...", code: "..." }`). The nested `error` object is
 * kept for clients already reading it.
 */
function withTopLevelCode(body: string): string {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return body;
  }

  const record = parsed as Record<string, unknown>;

  const nested = record.error;

  if (nested === null || typeof nested !== "object" || "code" in record) {
    return body;
  }

  const { code, message } = nested as { code?: unknown; message?: unknown };

  return JSON.stringify({
    ...record,
    ...(typeof code === "string" ? { code } : {}),
    ...(typeof message === "string" ? { message } : {}),
  });
}

function clientIpOf(remoteAddress: string | undefined): string {
  return typeof remoteAddress === "string" &&
    parseClientIp(remoteAddress) !== undefined
    ? remoteAddress
    : UNKNOWN_CLIENT_RATE_LIMIT_IP;
}
