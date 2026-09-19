/**
 * Internal service identifiers used for routing and logging.
 */
export const SERVICE_NAMES = Object.freeze({
  IDENTITY: "identity",
  ENROLLMENT: "enrollment",
  ASSESSMENT: "assessment",
  NOTIFICATION: "notification",
} as const);

/**
 * API version prefix for all routes.
 */
export const API_VERSION = "v1";

/**
 * Default request timeout in milliseconds.
 */
export const DEFAULT_REQUEST_TIMEOUT = 10_000;

/**
 * Rate limiting defaults.
 */
export const RATE_LIMIT = Object.freeze({
  WINDOW_MS: 60_000,
  MAX_REQUESTS: 100,
} as const);
