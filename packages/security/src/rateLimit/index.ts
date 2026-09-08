/**
 * @zudojs/security — Rate Limiting Barrel
 */

export {
  defaultKeyGenerator,
  defaultHandler,
  createRateLimiter,
  extractClientIp,
} from "./rateLimit.core.js";
export type { RateLimiterOptions, ClientIpOptions } from "./rateLimit.core.js";
