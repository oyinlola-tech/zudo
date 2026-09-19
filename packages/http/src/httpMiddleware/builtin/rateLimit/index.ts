/**
 * @zudojs/http/httpMiddleware/builtin/rateLimit
 *
 * Rate limiting middleware wrapping `@zudojs/security`'s `createRateLimiter`.
 */

export {
  createRateLimitMiddleware,
  type HttpRateLimiter,
  type RateLimitMiddlewareOptions,
} from "./httpMiddleware.rateLimit.js";
