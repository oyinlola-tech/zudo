/**
 * Base OpenAPI error and factory functions.
 *
 * Everything in this package runs while a service builds or validates its own
 * specification — none of it is triggered by a client request. So the
 * defaults are the server-side ones: status 500, not exposed. A document that
 * fails to build is an operator's problem, and leaking component names or
 * version mismatches into a client-visible body tells an attacker about the
 * shape of the API rather than telling the operator anything.
 */

import { OpenAPIError, type OpenAPIErrorOptions } from "@zudojs/errors";

/**
 * `OpenAPIError` (the base of every class in this package) and
 * `OpenAPIErrorOptions` live in `@zudojs/errors` (code `OPENAPI_DOCUMENT`,
 * category `openapi`, 500, not exposed); they are re-exported here so
 * existing imports keep working.
 */
export { OpenAPIError, type OpenAPIErrorOptions };

/** Creates an OpenAPI error. */
export function createOpenAPIError(
  message: string,
  options: OpenAPIErrorOptions = {},
): OpenAPIError {
  return new OpenAPIError(message, options);
}

/** Determines whether an unknown value is an OpenAPI error. */
export function isOpenAPIError(value: unknown): value is OpenAPIError {
  return value instanceof OpenAPIError;
}
