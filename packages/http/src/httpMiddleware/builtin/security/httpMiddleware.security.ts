/**
 * Security middleware factory.
 *
 * @module httpMiddleware/builtin/security
 */

import type { HttpMiddleware } from "../../httpMiddleware.type.js";


import { isValidHeaderFieldValue } from "../../../httpHeaders/security/index.js";

import { withResponseHeaders } from "../helpers/index.js";

/**
 * Headers applied when the caller does not override them.
 *
 * `createSecurityMiddleware()` previously defaulted every option to
 * `undefined` and therefore set no headers at all — its presence in a
 * codebase read as evidence that the control existed while shipping nothing.
 */
const DEFAULT_SECURITY_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
});

export interface SecurityMiddlewareOptions {
  readonly strictTransportSecurity?: string;

  readonly xContentTypeOptions?: string;

  readonly xFrameOptions?: string;

  readonly xXssProtection?: string;

  readonly contentSecurityPolicy?: string;

  readonly referrerPolicy?: string;

  /**
   * Set to `false` to emit only the headers explicitly configured above.
   * Defaults to `true`.
   */
  readonly useDefaults?: boolean;
}

export function createSecurityMiddleware(
  options: SecurityMiddlewareOptions = {},
): HttpMiddleware {
  const configured: Record<string, string | undefined> = {
    "strict-transport-security": options.strictTransportSecurity,
    "x-content-type-options": options.xContentTypeOptions,
    "x-frame-options": options.xFrameOptions,
    "x-xss-protection": options.xXssProtection,
    "content-security-policy": options.contentSecurityPolicy,
    "referrer-policy": options.referrerPolicy,
  };

  const resolved: Record<string, string> = {
    ...(options.useDefaults === false ? {} : DEFAULT_SECURITY_HEADERS),
  };

  for (const [name, value] of Object.entries(configured)) {
    if (value === undefined) {
      continue;
    }

    /*
     * Values reach here as raw strings from configuration. An unvalidated
     * CR/LF or control character in one is a response-splitting primitive.
     */
    if (!isValidHeaderFieldValue(value)) {
      throw new TypeError(
        `Invalid value for security header "${name}": it contains a control character or surrounding whitespace.`,
      );
    }

    resolved[name] = value;
  }

  return async (_context, next) => {
    const response = await next();

    return withResponseHeaders(response, resolved);
  };
}
