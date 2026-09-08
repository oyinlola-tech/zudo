/**
 * @zudojs/security — CORS
 *
 * Validates and generates CORS headers for cross-origin requests.
 */

import type { CorsConfig } from "../types/security.type.js";
import { withoutStickyFlags } from "../input/input.core.js";

/** Default CORS configuration (restrictive). */
const DEFAULT_CORS_CONFIG: Required<Omit<CorsConfig, "origin">> & {
  origin: undefined;
} = {
  origin: undefined,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: [],
  credentials: false,
  maxAge: 86400,
};

/**
 * CORS headers that should be set on responses.
 */
export interface CorsHeaders {
  "Access-Control-Allow-Origin"?: string;
  "Access-Control-Allow-Methods"?: string;
  "Access-Control-Allow-Headers"?: string;
  "Access-Control-Expose-Headers"?: string;
  "Access-Control-Allow-Credentials"?: string;
  "Access-Control-Max-Age"?: string;
  Vary?: string;
}

/**
 * Rejects a configuration that pairs a wildcard origin with credentials.
 *
 * Browsers refuse the combination outright, so shipping it is not a leak so
 * much as a policy that silently never works. Failing here turns a confusing
 * runtime symptom into a startup error.
 */
function assertConfigCoherent(config: CorsConfig): void {
  if (!config.credentials) return;

  const origin = config.origin;
  const hasWildcard =
    origin === "*" || (Array.isArray(origin) && origin.includes("*"));

  if (hasWildcard) {
    throw new Error(
      'CORS: credentials cannot be combined with a wildcard origin ("*"). ' +
        "Enumerate the allowed origins, or supply a function or RegExp.",
    );
  }
}

/**
 * Checks if a request origin is allowed.
 *
 * @param origin - The request Origin header value.
 * @param config - CORS configuration.
 * @returns The allowed origin value, or undefined if not allowed.
 */
export function isOriginAllowed(
  origin: string | undefined,
  config: CorsConfig,
): string | undefined {
  assertConfigCoherent(config);

  if (!origin) {
    return undefined;
  }

  const allowedOrigin = config.origin;

  if (allowedOrigin === undefined) {
    // No origin configuration = no CORS headers
    return undefined;
  }

  // Function check
  if (typeof allowedOrigin === "function") {
    return allowedOrigin(origin) ? origin : undefined;
  }

  // Regex check. A `g` or `y` flag would make `test` stateful via `lastIndex`,
  // so the same origin would alternate between allowed and denied.
  if (allowedOrigin instanceof RegExp) {
    return withoutStickyFlags(allowedOrigin).test(origin) ? origin : undefined;
  }

  // String check
  if (typeof allowedOrigin === "string") {
    if (allowedOrigin === "*") {
      return "*";
    }
    return allowedOrigin === origin ? origin : undefined;
  }

  // Array check
  if (Array.isArray(allowedOrigin)) {
    if (allowedOrigin.includes(origin)) {
      return origin;
    }
    // Check for wildcard in array
    if (allowedOrigin.includes("*")) {
      return "*";
    }
    return undefined;
  }

  return undefined;
}

/**
 * True when the allow-origin value depends on the request's Origin header.
 *
 * A reflected value must be accompanied by `Vary: Origin`, or a shared cache
 * will hand one origin's response — and its `Access-Control-Allow-Origin` — to
 * a different origin.
 */
function isReflected(config: CorsConfig): boolean {
  const origin = config.origin;
  if (origin === undefined) return false;
  if (origin === "*") return false;
  // A single literal string always produces the same header; everything else
  // (array, RegExp, predicate) varies with the request.
  return typeof origin !== "string";
}

/**
 * Generates CORS headers for a preflight request.
 *
 * @param requestOrigin - The request Origin header.
 * @param config - CORS configuration.
 * @param request - Optional preflight request details. When supplied, the
 *   requested method and headers are validated and an unacceptable preflight
 *   returns no CORS headers at all.
 * @returns CORS headers to set on the response.
 */
export function generatePreflightHeaders(
  requestOrigin: string | undefined,
  config: CorsConfig,
  request?: {
    readonly method?: string;
    readonly headers?: readonly string[];
  },
): CorsHeaders {
  const headers: CorsHeaders = {};

  // Vary is set even when the origin is rejected: the decision itself depends
  // on the Origin header, so the negative response is equally uncacheable
  // across origins.
  if (isReflected(config)) {
    headers.Vary = "Origin";
  }

  const allowedOrigin = isOriginAllowed(requestOrigin, config);
  if (!allowedOrigin) {
    // No matching origin — don't set CORS headers
    return headers;
  }

  // Reject the preflight outright when it asks for something not permitted,
  // rather than answering with a policy the browser will then enforce against.
  if (
    request?.method !== undefined &&
    !isMethodAllowed(request.method, config)
  ) {
    return headers;
  }
  if (
    request?.headers !== undefined &&
    getDisallowedHeaders([...request.headers], config).length > 0
  ) {
    return headers;
  }

  headers["Access-Control-Allow-Origin"] = allowedOrigin;

  const methods = config.methods ?? DEFAULT_CORS_CONFIG.methods;
  headers["Access-Control-Allow-Methods"] = methods.join(", ");

  const allowedHeaders =
    config.allowedHeaders ?? DEFAULT_CORS_CONFIG.allowedHeaders;
  headers["Access-Control-Allow-Headers"] = allowedHeaders.join(", ");

  if (config.credentials) {
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  const maxAge = config.maxAge ?? DEFAULT_CORS_CONFIG.maxAge;
  headers["Access-Control-Max-Age"] = String(maxAge);

  return headers;
}

/**
 * Generates CORS headers for a simple request.
 *
 * @param requestOrigin - The request Origin header.
 * @param config - CORS configuration.
 * @returns CORS headers to set on the response.
 */
export function generateSimpleHeaders(
  requestOrigin: string | undefined,
  config: CorsConfig,
): CorsHeaders {
  const headers: CorsHeaders = {};

  if (isReflected(config)) {
    headers.Vary = "Origin";
  }

  const allowedOrigin = isOriginAllowed(requestOrigin, config);
  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
  }

  if (config.credentials) {
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  const exposedHeaders = config.exposedHeaders;
  if (exposedHeaders && exposedHeaders.length > 0) {
    headers["Access-Control-Expose-Headers"] = exposedHeaders.join(", ");
  }

  return headers;
}

/**
 * Validates that a requested method is allowed.
 *
 * @param method - The HTTP method from Access-Control-Request-Method.
 * @param config - CORS configuration.
 * @returns True if the method is allowed.
 */
export function isMethodAllowed(method: string, config: CorsConfig): boolean {
  const allowedMethods = config.methods ?? DEFAULT_CORS_CONFIG.methods;
  return allowedMethods.some(
    (allowed) => allowed.toUpperCase() === method.toUpperCase(),
  );
}

/**
 * Validates that all requested headers are allowed.
 *
 * @param headers - Headers from Access-Control-Request-Headers.
 * @param config - CORS configuration.
 * @returns An array of disallowed headers, or empty array if all allowed.
 */
export function getDisallowedHeaders(
  headers: string[],
  config: CorsConfig,
): string[] {
  const allowedHeaders = new Set(
    (config.allowedHeaders ?? DEFAULT_CORS_CONFIG.allowedHeaders).map((h) =>
      h.toLowerCase(),
    ),
  );

  return headers.filter((h) => !allowedHeaders.has(h.trim().toLowerCase()));
}
