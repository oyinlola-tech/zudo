/**
 * @zudojs/security — Rate Limiting Barrel
 */

export {
  defaultKeyGenerator,
  defaultHandler,
  retryAfterSeconds,
  createRateLimiter,
  extractClientIp,
} from "./rateLimit.core.js";
export type { RateLimiterOptions, ClientIpOptions } from "./rateLimit.core.js";
