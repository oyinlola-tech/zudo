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
} from "./rateLimit.core.js";
import { extractClientIp } from "./rateLimit.clientIp.js";

export const rateLimit = {
  defaultKeyGenerator,
  defaultHandler,
  retryAfterSeconds,
  createRateLimiter,
  extractClientIp,
};
