/**
 * @zudojs/security — Core Types
 *
 * Security configuration interfaces and type definitions.
 */

/* ─── Header Security ──────────────────────────────────────────────────── */

/** Configuration for header security validation. */
export interface HeaderSecurityConfig {
  /** Maximum size of a single header value in bytes. */
  readonly maxValueSize?: number;
  /** Maximum number of headers allowed. */
  readonly maxHeaders?: number;
  /** Maximum total size of all headers in bytes. */
  readonly maxTotalSize?: number;
  /** Headers that should be rejected entirely. */
  readonly blockedHeaders?: readonly string[];
}

/** Result of header validation. */
export interface HeaderValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/* ─── Body Limits ──────────────────────────────────────────────────────── */

/** Configuration for body size limits. */
export interface BodyLimitConfig {
  /** Maximum body size in bytes. */
  readonly maxSize: number;
  /** Content types that use this limit (if empty, applies to all). */
  readonly contentTypes?: readonly string[];
}

/** Preset body limits for common use cases. */
export interface BodyLimitPresets {
  /** JSON API body limit (default: 1MB). */
  readonly json: number;
  /** Authentication endpoint limit (default: 256KB). */
  readonly auth: number;
  /** File upload limit (default: 100MB). */
  readonly upload: number;
  /** Webhook payload limit (default: 2MB). */
  readonly webhook: number;
}

/* ─── URL Validation ───────────────────────────────────────────────────── */

/** Configuration for URL validation. */
export interface UrlValidationConfig {
  /** Allowed protocols (default: ["http", "https"]). */
  readonly allowedProtocols?: readonly string[];
  /** Maximum URL length in characters. */
  readonly maxLength?: number;
  /** Whether to normalize paths (resolve . and ..). */
  readonly normalizePaths?: boolean;
  /** Whether to block path traversal attempts. */
  readonly blockTraversal?: boolean;
}

/** Result of URL validation. */
export interface UrlValidationResult {
  readonly valid: boolean;
  readonly normalized?: string;
  readonly errors: readonly string[];
}

/* ─── Cookie Security ──────────────────────────────────────────────────── */

/** Configuration for cookie security. */
export interface CookieSecurityConfig {
  /** Whether to set Secure flag by default. */
  readonly secure?: boolean;
  /** Whether to set HttpOnly flag by default. */
  readonly httpOnly?: boolean;
  /** Default SameSite policy. */
  readonly sameSite?: "strict" | "lax" | "none";
  /** Maximum cookie size in bytes. */
  readonly maxSize?: number;
  /** Maximum number of cookies. */
  readonly maxCount?: number;
}

/** A parsed cookie with security metadata. */
export interface ParsedCookie {
  readonly name: string;
  readonly value: string;
  readonly secure?: boolean;
  readonly httpOnly?: boolean;
  readonly sameSite?: "strict" | "lax" | "none";
  readonly path?: string;
  readonly domain?: string;
  readonly maxAge?: number;
  readonly expires?: Date;
  readonly partitioned?: boolean;
}

/* ─── CORS ─────────────────────────────────────────────────────────────── */

/** Configuration for CORS. */
export interface CorsConfig {
  /** Allowed origins (strings or regex patterns). */
  readonly origin?:
    string | readonly string[] | RegExp | ((origin: string) => boolean);
  /** Allowed HTTP methods. */
  readonly methods?: readonly string[];
  /** Allowed request headers. */
  readonly allowedHeaders?: readonly string[];
  /** Headers exposed to the browser. */
  readonly exposedHeaders?: readonly string[];
  /** Whether to include credentials. */
  readonly credentials?: boolean;
  /** Max age for preflight cache in seconds. */
  readonly maxAge?: number;
}

/* ─── CSRF ─────────────────────────────────────────────────────────────── */

/** Configuration for CSRF protection. */
export interface CsrfConfig {
  /** Secret key for token generation. */
  readonly secret: string;
  /** Token expiration in seconds. */
  readonly expiration?: number;
  /** Cookie name for the CSRF token. */
  readonly cookieName?: string;
  /** Header name for the CSRF token. */
  readonly headerName?: string;
  /** Methods that require CSRF protection. */
  readonly methods?: readonly string[];
}

/* ─── Rate Limiting ────────────────────────────────────────────────────── */

/** Configuration for rate limiting. */
export interface RateLimitConfig {
  /** Maximum requests per window. */
  readonly max: number;
  /** Window duration in milliseconds. */
  readonly windowMs: number;
  /** Key generator function (defaults to IP). */
  readonly keyGenerator?: (request: RateLimitRequest) => string;
  /** Custom handler when rate limit is exceeded. */
  readonly handler?: (
    request: RateLimitRequest,
    response: RateLimitResponse,
  ) => void;
  /** Skip certain requests. */
  readonly skip?: (request: RateLimitRequest) => boolean;
  /** Message returned when rate limited. */
  readonly message?: string;
}

/** Request info for rate limiting. */
export interface RateLimitRequest {
  readonly ip?: string;
  readonly method?: string;
  readonly path?: string;
  readonly headers?: Record<string, string | string[] | undefined>;
}

/** Response info for rate limiting. */
export interface RateLimitResponse {
  statusCode: number;
  headers: Record<string, string>;
  body?: string;
}

/** Result of rate limit check. */
export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: Date;
  readonly total: number;
}

/* ─── Security Headers ─────────────────────────────────────────────────── */

/** Configuration for security headers. */
export interface SecurityHeadersConfig {
  /** Content-Security-Policy directive. */
  readonly contentSecurityPolicy?: string;
  /** X-Content-Type-Options value (default: "nosniff"). */
  readonly contentTypeOptions?: string;
  /** X-Frame-Options value (default: "DENY"). */
  readonly frameOptions?: string;
  /** X-XSS-Protection value (default: "1; mode=block"). */
  readonly xssProtection?: string;
  /** Strict-Transport-Security value. */
  readonly hsts?: string;
  /** Referrer-Policy value (default: "strict-origin-when-cross-origin"). */
  readonly referrerPolicy?: string;
  /** Permissions-Policy value. */
  readonly permissionsPolicy?: string;
  /** X-DNS-Prefetch-Control value. */
  readonly dnsPrefetchControl?: string;
  /** Cross-Origin-Opener-Policy value. */
  readonly openerPolicy?: string;
  /** Cross-Origin-Resource-Policy value. */
  readonly resourcePolicy?: string;
}

/* ─── Request Validation ───────────────────────────────────────────────── */

/** Configuration for request validation. */
export interface RequestValidationConfig {
  /** Allowed HTTP methods. */
  readonly allowedMethods?: readonly string[];
  /** Maximum request line size in bytes. */
  readonly maxRequestLineSize?: number;
  /** Allowed hosts (empty = allow all). */
  readonly allowedHosts?: readonly string[];
  /** Whether to validate the Host header. */
  readonly validateHost?: boolean;
  /** Whether to validate Content-Length. */
  readonly validateContentLength?: boolean;
  /** Maximum Content-Length value. */
  readonly maxContentLength?: number;
}

/* ─── Input Sanitization ───────────────────────────────────────────────── */

/** Configuration for input sanitization. */
export interface InputSanitizationConfig {
  /** Whether to strip null bytes. */
  readonly stripNullBytes?: boolean;
  /** Whether to normalize Unicode. */
  readonly normalizeUnicode?: boolean;
  /** Maximum string length. */
  readonly maxStringLength?: number;
  /** Whether to prevent prototype pollution. */
  readonly preventPrototypePollution?: boolean;
  /** Maximum nesting depth to recurse into (default: 32). */
  readonly maxDepth?: number;
  /** Custom sanitizer function. */
  readonly customSanitizer?: (value: string) => string;
}

/** Keys that indicate prototype pollution attempts. */
export const PROTOTYPE_POLLUTION_KEYS = [
  "__proto__",
  "constructor",
  "prototype",
] as const;

/**
 * Common SQL injection patterns.
 *
 * Heuristics, not a parser: they carry a high false-positive rate on ordinary
 * prose (the word "update", a `#` in a hashtag) and must never be the only
 * defence. Parameterise queries; use these for logging and alerting.
 *
 * Like {@link XSS_PATTERNS}, none carries the `g` flag — see the note there.
 */
export const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|FETCH|DECLARE|TRUNCATE|COMMENT|ALTER)\b)/i,
  /(--|#|\/\*|\*\/)/,
  /('\s*(OR|AND)\s*')/i,
  /(;\s*(DROP|DELETE|INSERT|UPDATE))/i,
] as const;

/**
 * Common XSS patterns.
 *
 * These are matched with {@link RegExp.test}, so none of them carries the `g`
 * flag: a global regex advances `lastIndex` on every `test` call and resumes
 * from there on the next one, which makes a shared pattern report `false` for
 * a payload it matched a moment earlier.
 */
export const XSS_PATTERNS = [
  /<script\b[^>]*>[\s\S]*?<\/script[^>]*>/i,
  /<script\b[^>]*>/i,
  /<\/script[^>]*>/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /data:text\/html/i,
  /<iframe\b[^>]*>/i,
  /<object\b[^>]*>/i,
  /<embed\b[^>]*>/i,
] as const;
