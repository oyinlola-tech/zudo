/**
 * @zudojs/security
 *
 * Security primitives for the Zudojs framework.
 *
 * Provides input validation, header security, URL normalization,
 * body limits, cookie security, CORS, CSRF, rate limiting, and
 * security headers with secure defaults.
 *
 * @example
 * ```ts
 * import { validateHeaders, validateRequestTarget, generateSecurityHeaders } from '@zudojs/security';
 *
 * // Validate request headers
 * const result = validateHeaders(request.headers);
 * if (!result.valid) {
 *   throw new Error(result.errors.join(', '));
 * }
 *
 * // Validate the request target. Node's `request.url` is origin-form
 * // ("/users?page=1"), which has no scheme — `validateUrl` needs an absolute
 * // URL and reports every such target as malformed.
 * const targetResult = validateRequestTarget(request.url);
 *
 * // Add security headers
 * const headers = generateSecurityHeaders();
 * ```
 *
 * @packageDocumentation
 */

/* ─── Types ──────────────────────────────────────────────────────────────── */
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
} from "./types/security.type.js";

export {
  PROTOTYPE_POLLUTION_KEYS,
  SQL_INJECTION_PATTERNS,
  XSS_PATTERNS,
} from "./types/security.type.js";

/* ─── Header Security ────────────────────────────────────────────────────── */
export {
  validateHeaderName,
  validateHeaderValue,
  validateHeaders,
  sanitizeHeaderValue,
  isHopByHopHeader,
} from "./header/index.js";

/* ─── URL Validation ─────────────────────────────────────────────────────── */
export {
  validateUrl,
  normalizePath,
  validateRequestTarget,
  isSafeUrl,
  isPrivateHostname,
  containsTraversal,
  fullyDecodeUri,
} from "./url/index.js";
export type { RequestTargetConfig } from "./url/index.js";

/* ─── Body Validation ────────────────────────────────────────────────────── */
export {
  DEFAULT_BODY_LIMITS,
  parseMediaType,
  validateBodyFraming,
  validateContentLength,
  validateBodySize,
  getBodyLimitForContentType,
  validateBodyLimitConfig,
  resolveBodyLimit,
  createBodySizeChecker,
} from "./body/index.js";

/* ─── Cookie Security ────────────────────────────────────────────────────── */
export {
  parseCookieHeader,
  serializeCookie,
  createSecureCookie,
  validateCookieName,
  validateCookieValue,
  stripSensitiveCookies,
} from "./cookie/index.js";

/* ─── CORS ───────────────────────────────────────────────────────────────── */
export type { CorsHeaders } from "./cors/index.js";
export {
  isOriginAllowed,
  generatePreflightHeaders,
  generateSimpleHeaders,
  isMethodAllowed,
  getDisallowedHeaders,
} from "./cors/index.js";
export { cors } from "./cors/cors.namespace.js";

/* ─── CSRF ───────────────────────────────────────────────────────────────── */
export {
  generateCsrfToken,
  validateCsrfToken,
  verifyDoubleSubmit,
  requiresCsrfProtection,
  extractCsrfTokenFromHeaders,
  extractCsrfTokenFromCookies,
  generateCsrfCookie,
  createCsrfProtection,
  MIN_CSRF_SECRET_LENGTH,
} from "./csrf/index.js";
export type {
  CsrfTokenOptions,
  CsrfCookieOptions,
  CsrfProtection,
  CsrfProtectionOptions,
  IssuedCsrfToken,
  CsrfVerifiableRequest,
} from "./csrf/index.js";

/* ─── Rate Limiting ──────────────────────────────────────────────────────── */
export {
  defaultKeyGenerator,
  defaultHandler,
  retryAfterSeconds,
  createRateLimiter,
  extractClientIp,
} from "./rateLimit/index.js";
export type { RateLimiterOptions, ClientIpOptions } from "./rateLimit/index.js";
export { rateLimit } from "./rateLimit/rateLimit.namespace.js";

/* ─── Security Headers ───────────────────────────────────────────────────── */
export { SECURITY_HEADER_NAMES } from "./headers/index.js";
export {
  generateSecurityHeaders,
  getMissingSecurityHeaders,
  generateCspNonce,
  validateCspDirective,
} from "./headers/index.js";

/* ─── Input Sanitization ─────────────────────────────────────────────────── */
export {
  containsSqlInjection,
  containsXss,
  containsPrototypePollution,
  sanitizeString,
  sanitizeObject,
  isSafeString,
  withoutStickyFlags,
  detectThreats,
  escapeHtml,
  stripHtml,
} from "./input/index.js";
