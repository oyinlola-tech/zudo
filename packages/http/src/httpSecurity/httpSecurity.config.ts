/**
 * @zudojs/http — Security configuration types.
 *
 * Defines the configuration for HTTP security features:
 * body limits, header validation, host validation and proxy trust.
 *
 * Every field here is read by `guardRequest` or by the trust-proxy layer.
 * `trustedProxyCount`, `requestTimeout`, `headersTimeout` and
 * `keepAliveTimeout` were removed: nothing in the package read them, and their
 * JSDoc made an explicit and false promise ("default: 30000") that an operator
 * setting `requestTimeout: 5000` was protected against slowloris. The Node
 * adapter has its own, separately named timeout options, and those are the
 * ones that take effect.
 */

/** Configuration for HTTP request security guards. */
export interface HTTPSecurityConfig {
  /** Maximum request body size in bytes (default: 1MB). */
  readonly maxBodySize?: number;
  /** Maximum number of headers allowed (default: 100). */
  readonly maxHeaders?: number;
  /** Maximum individual header value size in bytes (default: 8KB). */
  readonly maxHeaderValueSize?: number;
  /** Maximum request URL length (default: 2048). */
  readonly maxUrlLength?: number;
  /** Maximum query string length (default: 4096). */
  readonly maxQueryLength?: number;
  /** Allowed Host header values. Empty = allow all. */
  readonly allowedHosts?: readonly string[];
  /**
   * Whether `X-Forwarded-*` headers may be trusted (default: `false`).
   *
   * Consumed by `httpTrustProxy` and the adapter, not by `guardRequest`. For a
   * real proxy set — CIDR ranges, named presets, a predicate — pass a
   * `TrustProxy` value to the adapter directly; this flag is only the
   * on/off signal.
   */
  readonly trustProxy?: boolean;
  /** Maximum request ID length (default: 128). */
  readonly maxRequestIdLength?: number;
  /** Characters allowed in request IDs (default: alphanumeric + hyphens + underscores). */
  readonly requestIdPattern?: RegExp;
  /** Whether to enable CRLF injection protection (default: true). */
  readonly enableCrlfProtection?: boolean;
  /** Whether to enable request smuggling protection (default: true). */
  readonly enableSmugglingProtection?: boolean;
}

/** Default security configuration. */
export const DEFAULT_SECURITY_CONFIG: Required<HTTPSecurityConfig> =
  Object.freeze({
    maxBodySize: 1_048_576, // 1MB
    maxHeaders: 100,
    maxHeaderValueSize: 8_192, // 8KB
    maxUrlLength: 2048,
    maxQueryLength: 4096,
    allowedHosts: [],
    trustProxy: false,
    maxRequestIdLength: 128,
    requestIdPattern: /^[a-zA-Z0-9_-]+$/,
    enableCrlfProtection: true,
    enableSmugglingProtection: true,
  });
