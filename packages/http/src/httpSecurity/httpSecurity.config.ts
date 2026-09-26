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

import { INCOMING_REQUEST_ID_PATTERN } from "../httpRequest/requestId/httpRequest.requestId.js";

/**
 * Default maximum request body size, in bytes (10 MiB).
 *
 * One number for the whole package: the request guard's `Content-Length`
 * check, the Node adapter's body reader and the fetch helpers all default to
 * it. The guard used to say 1 MB while the adapters read up to 10 MB, so the
 * documented limit and the enforced one disagreed.
 */
export const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024;

/** Configuration for HTTP request security guards. */
export interface HTTPSecurityConfig {
  /** Maximum request body size in bytes (default: {@link DEFAULT_MAX_BODY_SIZE}). */
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
   * Whether a request without a Host header is rejected (default: true).
   * The Node adapter relaxes this for HTTP/1.0 requests, where Host is
   * optional and some load-balancer health checks omit it.
   */
  readonly requireHost?: boolean;
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
    maxBodySize: DEFAULT_MAX_BODY_SIZE,
    maxHeaders: 100,
    maxHeaderValueSize: 8_192, // 8KB
    maxUrlLength: 2048,
    maxQueryLength: 4096,
    allowedHosts: [],
    requireHost: true,
    trustProxy: false,
    maxRequestIdLength: 128,
    // Same rule the adapter uses to reuse an incoming x-request-id, so an id
    // it would accept (trace ids like `svc.a:123`) is not refused here first.
    requestIdPattern: INCOMING_REQUEST_ID_PATTERN,
    enableCrlfProtection: true,
    enableSmugglingProtection: true,
  });
