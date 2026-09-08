/**
 * Validation limit constants.
 *
 * @module validation/validation
 */

import { Limits } from "../common/common.constant.js";

/**
 * Maximum allowed lengths for common fields.
 */
export const ValidationLength = Object.freeze({
  /** Short identifier (e.g. slug, code) */
  SHORT: 64,
  /** Standard name field */
  NAME: 128,
  /** Email address (RFC 5321 maximum total length) */
  EMAIL: 254,
  /** Display name or title (canonical: {@link Limits.MAX_DISPLAY_LENGTH}) */
  DISPLAY: Limits.MAX_DISPLAY_LENGTH,
  /** Short description */
  DESCRIPTION_SHORT: 500,
  /** Long description or text body */
  DESCRIPTION_LONG: 5_000,
  /** URL */
  URL: 2_048,
  /** Password */
  PASSWORD: 128,
  /** Full text content */
  FULL_TEXT: 50_000,
} as const);

/**
 * Numeric range limits for validation.
 */
export const ValidationRange = Object.freeze({
  /** Minimum port number */
  MIN_PORT: 1,
  /** Maximum port number */
  MAX_PORT: 65_535,
  /** Minimum percentage */
  MIN_PERCENTAGE: 0,
  /** Maximum percentage */
  MAX_PERCENTAGE: 100,
  /** Minimum page number (1-based) */
  MIN_PAGE: 1,
  /** Maximum page size (canonical: {@link Limits.MAX_PAGE_SIZE}) */
  MAX_PAGE_SIZE: Limits.MAX_PAGE_SIZE,
  /** Minimum pagination offset */
  MIN_OFFSET: 0,
  /** Maximum timeout in seconds */
  MAX_TIMEOUT_SECONDS: 3_600,
  /** Minimum retry count */
  MIN_RETRIES: 0,
  /**
   * Maximum retry count a caller may configure (upper validation bound;
   * canonical: {@link Limits.MAX_RETRY_ATTEMPTS}).
   *
   * Note: this is intentionally larger than `DefaultRetry.MAX_ATTEMPTS` (3),
   * which is the out-of-the-box default — this constant caps what users may
   * request, the other is what they get if they configure nothing.
   */
  MAX_RETRIES: Limits.MAX_RETRY_ATTEMPTS,
} as const);
