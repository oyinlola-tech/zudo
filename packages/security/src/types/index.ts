/**
 * @zudojs/security — Types Barrel
 *
 * Re-exports all security configuration and result types.
 */

export type {
  HeaderSecurityConfig,
  HeaderValidationResult,
  BodyLimitConfig,
  BodyLimitPresets,
  UrlValidationConfig,
  UrlValidationResult,
  CookieSecurityConfig,
  ParsedCookie,
  CorsConfig,
  CsrfConfig,
  RateLimitConfig,
  RateLimitRequest,
  RateLimitResponse,
  RateLimitResult,
  SecurityHeadersConfig,
  InputSanitizationConfig,
} from "./security.type.js";

export {
  PROTOTYPE_POLLUTION_KEYS,
  SQL_INJECTION_PATTERNS,
  XSS_PATTERNS,
} from "./security.type.js";
