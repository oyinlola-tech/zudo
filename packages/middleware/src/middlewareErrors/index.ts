/**
 * Middleware-specific error types.
 *
 * @module middlewareErrors
 */

export {
  MiddlewareError,
  MiddlewareTimeoutError,
  MiddlewareNextCalledMultipleTimesError,
  MiddlewareLimitExceededError,
  MiddlewareDepthExceededError,
  MiddlewareRateLimitError,
  MiddlewareAbortedError,
} from "./middlewareError.base.js";
