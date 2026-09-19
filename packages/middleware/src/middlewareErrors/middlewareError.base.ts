/**
 * Middleware-specific error classes.
 *
 * Every class is owned by `@zudojs/errors` and re-exported here, so
 * `instanceof` checks against either import path match the same errors.
 * Codes, messages and fields are unchanged.
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
} from "@zudojs/errors";
