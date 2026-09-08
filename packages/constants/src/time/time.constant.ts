/**
 * Time duration constants in milliseconds.
 *
 * @module time/time
 */

/**
 * Millisecond durations for common time periods.
 */
export const TimeMs = Object.freeze({
  /** 1 millisecond */
  MILLISECOND: 1,
  /** 1 second = 1,000 ms */
  SECOND: 1_000,
  /** 1 minute = 60,000 ms */
  MINUTE: 60_000,
  /** 1 hour = 3,600,000 ms */
  HOUR: 3_600_000,
  /** 1 day = 86,400,000 ms */
  DAY: 86_400_000,
  /** 1 week = 604,800,000 ms */
  WEEK: 604_800_000,
  /** 30 days (approximate month) */
  MONTH: 2_592_000_000,
  /** 365 days (approximate year) */
  YEAR: 31_536_000_000,
} as const);

/**
 * Default timeout values in milliseconds.
 */
export const DefaultTimeout = Object.freeze({
  /** Quick operation (e.g. cache lookup) */
  FAST: 1_000,
  /** Standard operation (e.g. API call) */
  STANDARD: 10_000,
  /** Long operation (e.g. file upload) */
  SLOW: 30_000,
  /** Background task */
  BACKGROUND: 60_000,
  /** Database query */
  DATABASE: 15_000,
  /** HTTP request */
  HTTP_REQUEST: 10_000,
  /** WebSocket connection */
  WEBSOCKET: 5_000,
} as const);

/**
 * Default retry configuration values.
 */
export const DefaultRetry = Object.freeze({
  /**
   * Default number of retry attempts used when nothing is configured.
   *
   * Distinct from `Limits.MAX_RETRY_ATTEMPTS` (10; also surfaced as
   * `ValidationRange.MAX_RETRIES`), which is the upper bound on what a caller
   * may configure — this is merely the out-of-the-box default.
   */
  MAX_ATTEMPTS: 3,
  /** Base delay between retries in ms */
  BASE_DELAY_MS: 1_000,
  /** Maximum delay between retries in ms */
  MAX_DELAY_MS: 30_000,
  /** Exponential backoff multiplier */
  BACKOFF_MULTIPLIER: 2,
} as const);

/**
 * Convert a duration from one unit to milliseconds.
 *
 * @param value - The numeric value
 * @param unit - The source unit
 * @returns Duration in milliseconds
 */
export function toMilliseconds(
  value: number,
  unit: "milliseconds" | "seconds" | "minutes" | "hours" | "days",
): number {
  switch (unit) {
    case "milliseconds":
      return value;
    case "seconds":
      return value * TimeMs.SECOND;
    case "minutes":
      return value * TimeMs.MINUTE;
    case "hours":
      return value * TimeMs.HOUR;
    case "days":
      return value * TimeMs.DAY;
  }
}

/**
 * Format a millisecond duration to a human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @returns Human-readable string (e.g. "5s", "2m 30s", "1h 15m")
 */
export function formatDuration(ms: number): string {
  if (ms < TimeMs.SECOND) return `${ms}ms`;
  if (ms < TimeMs.MINUTE) return `${Math.floor(ms / TimeMs.SECOND)}s`;
  if (ms < TimeMs.HOUR) {
    const m = Math.floor(ms / TimeMs.MINUTE);
    const s = Math.floor((ms % TimeMs.MINUTE) / TimeMs.SECOND);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  if (ms < TimeMs.DAY) {
    const h = Math.floor(ms / TimeMs.HOUR);
    const m = Math.floor((ms % TimeMs.HOUR) / TimeMs.MINUTE);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(ms / TimeMs.DAY);
  const h = Math.floor((ms % TimeMs.DAY) / TimeMs.HOUR);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}
