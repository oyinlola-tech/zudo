/**
 * Recommended security headers factory.
 *
 * @module httpSecurityHeaders/recommended
 */

import type {
  PermissionsPolicy,
  SecurityHeaders,
  SecurityHeadersOptions,
} from "./core/httpSecurityHeader.type.js";

import { DEFAULT_REFERRER_POLICY } from "./core/httpSecurityHeader.type.js";

import { createSecurityHeaders } from "./httpSecurityHeader.factory.js";

export interface RecommendedSecurityHeadersOptions {
  readonly csp?: boolean | string;
  readonly hsts?: boolean | { readonly maxAge?: number };
  readonly xFrameOptions?: boolean | "DENY" | "SAMEORIGIN";
  readonly referrerPolicy?: boolean;
  readonly permissionsPolicy?: boolean;
  readonly crossOriginPolicies?: boolean;
}

/**
 * Creates a recommended set of security headers.
 *
 * Called with no options this now emits a genuinely protective set —
 * `Content-Security-Policy`, `Strict-Transport-Security`, `nosniff`,
 * `X-Frame-Options: DENY`, `Referrer-Policy`, a deny-by-default
 * `Permissions-Policy`, the three cross-origin isolation headers, and
 * `X-Permitted-Cross-Domain-Policies: none`. Each can be disabled explicitly
 * with `false`.
 *
 * `?? ` is deliberately not used for the booleans below: it would make
 * `csp: false` indistinguishable from "unset" only for `undefined`, which is
 * what is wanted, but the previous defaults were `false`, so a caller who
 * passed nothing got almost nothing.
 */
export function createRecommendedSecurityHeaders(
  options: RecommendedSecurityHeadersOptions = {},
): SecurityHeaders {
  return createSecurityHeaders({
    contentSecurityPolicy: options.csp ?? true,
    strictTransportSecurity: options.hsts ?? true,
    xContentTypeOptions: true,
    xFrameOptions: options.xFrameOptions ?? "DENY",
    referrerPolicy: options.referrerPolicy ?? true,
    permissionsPolicy: options.permissionsPolicy ?? true,
    crossOriginEmbedderPolicy: options.crossOriginPolicies ?? true,
    crossOriginOpenerPolicy: options.crossOriginPolicies ?? true,
    crossOriginResourcePolicy: options.crossOriginPolicies ?? true,
    xPermittedCrossDomainPolicies: true,
  });
}

/**
 * The option set `createSecurityMiddleware()` (and any other zero-config
 * caller) should use when it is given nothing.
 *
 * Exposed so a middleware does not have to re-derive a safe baseline and
 * cannot accidentally emit an empty one.
 */
export function createDefaultSecurityHeaderOptions(): SecurityHeadersOptions {
  return {
    contentSecurityPolicy: true,
    strictTransportSecurity: true,
    xContentTypeOptions: true,
    xFrameOptions: "DENY",
    referrerPolicy: DEFAULT_REFERRER_POLICY,
    permissionsPolicy: createDefaultPermissionsPolicy(),
    crossOriginOpenerPolicy: "same-origin",
    crossOriginResourcePolicy: "same-site",
    xPermittedCrossDomainPolicies: "none",
  };
}

/**
 * The zero-config header set. Never empty.
 */
export function createDefaultSecurityHeaders(): SecurityHeaders {
  return createSecurityHeaders(createDefaultSecurityHeaderOptions());
}

/**
 * Creates default CSP options for a web application.
 */
export function createDefaultCSPOptions(): Record<string, readonly string[]> {
  return {
    "default-src": ["'self'"],
    "script-src": ["'self'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "https:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
}

/**
 * Creates default HSTS options.
 */
export function createDefaultHSTSOptions(): {
  readonly maxAge: number;
  readonly includeSubDomains: boolean;
  readonly preload: boolean;
} {
  return {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  };
}

/**
 * Creates a default Permissions-Policy that denies the high-risk features a
 * typical application never uses.
 *
 * `permissionsPolicy: true` previously formatted `{}` into the empty string,
 * emitting a header that permits everything while appearing to be configured.
 */
export function createDefaultPermissionsPolicy(): PermissionsPolicy {
  return {
    accelerometer: false,
    "ambient-light-sensor": false,
    autoplay: false,
    battery: false,
    camera: false,
    "display-capture": false,
    "document-domain": false,
    "encrypted-media": false,
    fullscreen: false,
    geolocation: false,
    gyroscope: false,
    magnetometer: false,
    microphone: false,
    midi: false,
    payment: false,
    "picture-in-picture": false,
    "publickey-credentials-get": false,
    "screen-wake-lock": false,
    usb: false,
    "xr-spatial-tracking": false,
  };
}
