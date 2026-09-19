/**
 * HTTP middleware error types.
 *
 * `HttpMiddlewareError` and `HttpMiddlewarePipelineError` live in
 * `@zudojs/errors` (both `BaseError`s, 500, not exposed, codes
 * `HTTP_MIDDLEWARE_ERROR` / `MIDDLEWARE_PIPELINE_ERROR`); they are
 * re-exported here so existing imports keep working.
 *
 * @module httpMiddleware/errors
 */

export {
  HttpMiddlewareError,
  HttpMiddlewarePipelineError,
  type HttpMiddlewareErrorOptions,
} from "@zudojs/errors";
