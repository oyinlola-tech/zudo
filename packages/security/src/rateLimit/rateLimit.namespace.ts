/**
 * @zudojs/security — Rate Limit Namespace
 *
 * Convenience namespace for rate limiting utilities.
 */

import {
  defaultKeyGenerator,
  defaultHandler,
  retryAfterSeconds,
  createRateLimiter,
  extractClientIp,
} from "./rateLimit.core.js";

export const rateLimit = {
  defaultKeyGenerator,
  defaultHandler,
  retryAfterSeconds,
  createRateLimiter,
  extractClientIp,
};
