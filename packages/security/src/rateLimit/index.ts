/**
 * @zudojs/security — Rate Limiting Barrel
 *
 * Sliding-window limiter, client address extraction, and IP-derived
 * rate-limit keys (port-stripped, IPv6 bucketed by prefix).
 */

export {
  defaultKeyGenerator,
  defaultHandler,
  retryAfterSeconds,
  createRateLimiter,
} from "./rateLimit.core.js";
export type { RateLimiterOptions } from "./rateLimit.core.js";
export { extractClientIp } from "./rateLimit.clientIp.js";
export type { ClientIpOptions } from "./rateLimit.clientIp.js";
export {
  createIpKeyGenerator,
  ipRateLimitKey,
  parseClientIp,
  DEFAULT_IPV6_PREFIX_LENGTH,
} from "./rateLimit.clientKey.js";
export type { IpKeyOptions } from "./rateLimit.clientKey.js";
