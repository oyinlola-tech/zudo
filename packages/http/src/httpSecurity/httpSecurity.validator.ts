/**
 * @zudojs/http — Request validation functions.
 *
 * Validates incoming HTTP requests against security constraints:
 * body size, header count, header values, URL length, host, and
 * request ID format.
 */

import type { HTTPSecurityConfig } from "./httpSecurity.config.js";
import { DEFAULT_SECURITY_CONFIG } from "./httpSecurity.config.js";

/** Result of a security validation check. */
export interface SecurityValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/** Merge user config with defaults. */
function resolveConfig(
  config?: Partial<HTTPSecurityConfig>,
): Required<HTTPSecurityConfig> {
  return { ...DEFAULT_SECURITY_CONFIG, ...config };
}

/**
 * Validate request headers against security limits.
 */
export function validateHeaders(
  headers: Record<string, string | string[] | undefined>,
  config?: Partial<HTTPSecurityConfig>,
): SecurityValidationResult {
  const cfg = resolveConfig(config);
  const errors: string[] = [];

  const entries = Object.entries(headers);
  if (entries.length > cfg.maxHeaders) {
    errors.push(`Too many headers: ${entries.length} > ${cfg.maxHeaders}`);
  }

  for (const [key, value] of entries) {
    if (typeof value === "string" && value.length > cfg.maxHeaderValueSize) {
      errors.push(
        `Header "${key}" value too large: ${value.length} > ${cfg.maxHeaderValueSize}`,
      );
    }
    if (
      cfg.enableCrlfProtection &&
      typeof value === "string" &&
      /[\r\n]/.test(value)
    ) {
      errors.push(`Header "${key}" contains CRLF characters`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate the Host header against allowed hosts.
 */
export function validateHost(
  host: string | undefined,
  config?: Partial<HTTPSecurityConfig>,
): SecurityValidationResult {
  const cfg = resolveConfig(config);

  if (!host) {
    return cfg.requireHost
      ? { valid: false, errors: ["Missing Host header"] }
      : { valid: true, errors: [] };
  }
  if (cfg.allowedHosts.length === 0) {
    return { valid: true, errors: [] };
  }

  const hostname = host.split(":")[0] ?? host;
  const allowed = cfg.allowedHosts.some((h) => h === hostname || h === host);

  return allowed
    ? { valid: true, errors: [] }
    : { valid: false, errors: [`Host "${host}" is not in allowed hosts`] };
}

/**
 * Validate request URL length.
 */
export function validateUrl(
  url: string,
  config?: Partial<HTTPSecurityConfig>,
): SecurityValidationResult {
  const cfg = resolveConfig(config);
  if (url.length > cfg.maxUrlLength) {
    return {
      valid: false,
      errors: [`URL too long: ${url.length} > ${cfg.maxUrlLength}`],
    };
  }
  return { valid: true, errors: [] };
}

/**
 * Validate query string length.
 */
export function validateQuery(
  query: string,
  config?: Partial<HTTPSecurityConfig>,
): SecurityValidationResult {
  const cfg = resolveConfig(config);
  if (query.length > cfg.maxQueryLength) {
    return {
      valid: false,
      errors: [
        `Query string too long: ${query.length} > ${cfg.maxQueryLength}`,
      ],
    };
  }
  return { valid: true, errors: [] };
}

/**
 * Validate Content-Length header against body size limit.
 */
export function validateContentLength(
  contentLength: string | undefined,
  config?: Partial<HTTPSecurityConfig>,
): SecurityValidationResult {
  if (!contentLength) {
    return { valid: true, errors: [] };
  }

  const cfg = resolveConfig(config);
  const length = Number(contentLength);

  if (!Number.isFinite(length) || length < 0) {
    return { valid: false, errors: ["Invalid Content-Length value"] };
  }

  if (!Number.isSafeInteger(length)) {
    return { valid: false, errors: ["Content-Length is not a safe integer"] };
  }

  if (length > cfg.maxBodySize) {
    return {
      valid: false,
      errors: [
        `Content-Length exceeds body limit: ${length} > ${cfg.maxBodySize}`,
      ],
    };
  }

  return { valid: true, errors: [] };
}

/**
 * Validate X-Request-ID format and length.
 */
export function validateRequestId(
  requestId: string | undefined,
  config?: Partial<HTTPSecurityConfig>,
): SecurityValidationResult {
  if (!requestId) {
    return { valid: true, errors: [] };
  }

  const cfg = resolveConfig(config);

  if (requestId.length > cfg.maxRequestIdLength) {
    return {
      valid: false,
      errors: [
        `Request ID too long: ${requestId.length} > ${cfg.maxRequestIdLength}`,
      ],
    };
  }

  if (!cfg.requestIdPattern.test(requestId)) {
    return {
      valid: false,
      errors: ["Request ID contains invalid characters"],
    };
  }

  return { valid: true, errors: [] };
}

/**
 * Validate transfer encoding to prevent request smuggling.
 */
export function validateTransferEncoding(
  transferEncoding: string | undefined,
  contentLength: string | undefined,
  config?: Partial<HTTPSecurityConfig>,
): SecurityValidationResult {
  const cfg = resolveConfig(config);
  if (!cfg.enableSmugglingProtection) {
    return { valid: true, errors: [] };
  }

  if (transferEncoding && contentLength) {
    return {
      valid: false,
      errors: ["Request contains both Transfer-Encoding and Content-Length"],
    };
  }

  if (transferEncoding && !transferEncoding.toLowerCase().includes("chunked")) {
    return {
      valid: false,
      errors: [`Unsupported Transfer-Encoding: "${transferEncoding}"`],
    };
  }

  return { valid: true, errors: [] };
}
