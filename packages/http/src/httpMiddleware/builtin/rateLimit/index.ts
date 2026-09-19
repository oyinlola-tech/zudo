/**
 * @zudojs/http/httpMiddleware/builtin/rateLimit
 *
 * Rate limiting middleware wrapping `@zudojs/security`'s `createRateLimiter`.
 */

export {
  createRateLimitMiddleware,
  UNKNOWN_CLIENT_RATE_LIMIT_IP,
  type HttpRateLimiter,
  type RateLimitMiddlewareOptions,
} from "./httpMiddleware.rateLimit.js";
