/**
 * Security middleware factory.
 *
 * @module httpMiddleware/builtin/security
 */

import type { HttpMiddleware } from "../../httpMiddleware.type.js";


import { isValidHeaderFieldValue } from "../../../httpHeaders/security/index.js";

import { createSecurityHeaders } from "../../../httpSecurityHeaders/httpSecurityHeader.factory.js";

import { createDefaultSecurityHeaderOptions } from "../../../httpSecurityHeaders/httpSecurityHeader.recommended.js";

import { withResponseHeaders } from "../helpers/index.js";

/**
 * The headers applied when the caller does not override them.
 *
 * This is the package's declared safe baseline — the very set
 * `createDefaultSecurityHeaderOptions` was written for and, until now, was
 * never called for. The middleware used to re-derive its own three-entry
 * list, so `pipeline.use(createSecurityMiddleware())` emitted no
 * `Content-Security-Policy`, no `Strict-Transport-Security`, no
 * `Permissions-Policy` and none of the cross-origin isolation headers while
 * reading as evidence that the control was in force.
 */
function defaultSecurityHeaders(): Record<string, string> {
  return createSecurityHeaders(createDefaultSecurityHeaderOptions()) as Record<
    string,
    string
  >;
}

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

/**
 * Creates the response-hardening middleware.
 *
 * Called with no options it emits the package's default security header set
 * ({@link createDefaultSecurityHeaderOptions}); the options below layer over
 * that set, and `useDefaults: false` drops it entirely.
 *
 * @param options - Explicit header values, layered over the baseline.
 * @returns A middleware that adds the headers to the downstream response.
 * @throws {TypeError} If a configured value contains a control character.
 */
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

  const resolved: Record<string, string> =
    options.useDefaults === false ? {} : defaultSecurityHeaders();

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
