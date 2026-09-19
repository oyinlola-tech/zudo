/**
 * Base OAuth2 client error, on the shared hierarchy.
 *
 * Matches `@zudojs/auth-oauth`'s local `OAuthError` (name, `code`,
 * `statusCode`, `expose` defaults), so that package can extend this class
 * instead of `Error`. Codes are the `ErrorCode.OAUTH_*` members, whose values
 * equal that package's `OAuthErrorCode` strings.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/** Options accepted by {@link OAuthError}. */
export interface OAuthErrorOptions {
  readonly code?: string;
  readonly statusCode?: number;
  readonly expose?: boolean;
  readonly cause?: unknown;
}

/**
 * Base error for every OAuth2 failure. Defaults: 400, exposed, code
 * `OAUTH_PROVIDER_REJECTED`.
 */
export class OAuthError extends BaseError {
  constructor(message: string, options?: OAuthErrorOptions) {
    super(message, {
      code: options?.code ?? ErrorCode.OAUTH_PROVIDER_REJECTED,
      category: ErrorCategory.AUTHENTICATION,
      severity: ErrorSeverity.ERROR,
      statusCode: options?.statusCode ?? 400,
      expose: options?.expose ?? true,
      cause: options?.cause,
    });
    this.name = "OAuthError";
  }
}
